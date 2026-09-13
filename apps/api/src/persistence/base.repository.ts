import type { Pool, PoolClient } from 'pg';
import { decodeCursor, encodeCursor } from './cursor';
import {
  ConditionFailed,
  parseCondition,
  parseFilter,
  parseUpdateExpression,
  type AttributeWrite,
} from './expressions';
import type { TransactionItems } from './transactor';

/**
 * Attributes that describe WHERE an item lives, not what it is.
 *
 * A loaded item carries these, and re-spreading them over a freshly built key
 * silently writes back to the old location. Stripping them at the boundary
 * means a rewrite always lands where its key builder says.
 *
 * They are also the indexed COLUMNS: the row keeps the whole item in `item`
 * jsonb and lifts these out beside it, so the five partial indexes have
 * something to index. `data-model.md` § The one table.
 */
const KEY_ATTRIBUTES = [
  'pk',
  'sk',
  'gsi1pk',
  'gsi1sk',
  'gsi2pk',
  'gsi2sk',
  'gsi3pk',
  'gsi3sk',
  'gsi4pk',
  'gsi4sk',
  'gsi5pk',
  'gsi5sk',
] as const;

export function stripKeys<T extends Record<string, unknown>>(item: T): T {
  const out = { ...item };
  for (const attribute of KEY_ATTRIBUTES) delete out[attribute];
  return out;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface QueryOptions {
  indexName?: 'gsi1' | 'gsi2' | 'gsi3' | 'gsi4' | 'gsi5';
  skPrefix?: string;
  /** 008/A44. Everything after this sort key. Mutually exclusive with skPrefix. */
  skGreaterThan?: string;
  limit?: number;
  cursor?: string | null;
  ascending?: boolean;
  filter?: { expression: string; names?: Record<string, string>; values?: Record<string, unknown> };
}

/** The columns lifted out of an item so the indexes have something to index. */
function keyColumns(item: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const attribute of KEY_ATTRIBUTES) {
    const value = item[attribute];
    out[attribute] = typeof value === 'string' ? value : null;
  }
  return out;
}

/**
 * `like` treats these as wildcards, so a sort key containing one would match
 * more than itself. The product's keys are built from `keys.ts` and contain
 * none of them today; escaping is here so that stays true by construction
 * rather than by luck.
 */
function escapeLike(value: string): string {
  return value.replace(/([\\%_])/g, '\\$1');
}

/**
 * Shared single-table access. Every repository extends this.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 010 — THE ENGINE UNDERNEATH CHANGED; NOTHING ABOVE IT DID
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `keys.ts` is untouched. Every `USER#<id>`, `#PROFILE`, `MEDIA#000` and every
 * zero-padded sort key carrying publication order means exactly what it meant,
 * and so do the 26 access patterns and the denormalised `visibility` on index
 * rows that lets the boundary run over query results.
 *
 * What these seven methods must GUARANTEE is fixed by
 * `specs/010-managed-backend/contracts/datastore-primitives.md` and enforced by
 * `tests/integration/datastore-primitives.spec.ts` — which was watched green on
 * the engine being replaced BEFORE any of this was written, so it describes
 * behaviour the product already relied on rather than whatever this file
 * happens to do.
 */
export abstract class BaseRepository {
  constructor(
    protected readonly pool: Pool,
    /**
     * Unused by this engine, which has one table, and kept for one release so
     * that replacing the engine and re-signing twenty-nine constructors are two
     * changes rather than one. Phase 6 removes it.
     */
    protected readonly tableName: string,
  ) {}

  // ── 1. getItem ───────────────────────────────────────────────────────────
  protected async getItem<T>(key: Record<string, string>): Promise<T | null> {
    const { rows } = await this.pool.query<{ item: Record<string, unknown> }>(
      'select item from items where pk = $1 and sk = $2',
      [key['pk'], key['sk']],
    );
    const row = rows[0];
    return row ? (stripKeys(row.item) as T) : null;
  }

  // ── 2. putItem ───────────────────────────────────────────────────────────
  /**
   * THE CONDITION IS PART OF THE STATEMENT, never a read followed by a write.
   *
   * A read-then-write passes every sequential test of this and fails under the
   * two simultaneous requests it exists for — and this is what makes handle
   * uniqueness work, so failing means two people hold one handle.
   * `on conflict do nothing` is decided by the database, once, atomically.
   */
  protected async putItem(item: Record<string, unknown>, condition?: string): Promise<void> {
    await runPut(this.pool, item, condition);
  }

  // ── 3. deleteItem ────────────────────────────────────────────────────────
  protected async deleteItem(key: Record<string, string>): Promise<void> {
    // No row-count check: deleting something absent MUST succeed. Callers rely
    // on it — block severance deletes rows that may or may not be there, and a
    // throw would turn "already gone" into a failed request.
    await this.pool.query('delete from items where pk = $1 and sk = $2', [key['pk'], key['sk']]);
  }

  // ── 5. increment ─────────────────────────────────────────────────────────
  /**
   * ONE STATEMENT, so two concurrent likes cannot lose one another.
   *
   * Not a change: the old engine's `ADD` was already atomic, whatever
   * `data-model.md` says about a read-modify-write — that comment belongs to a
   * different operation in `comment.repository.ts`. This holds the new engine
   * to behaviour the product already had rather than crediting it with an
   * improvement it did not make.
   */
  protected async increment(
    key: Record<string, string>,
    attribute: string,
    by: number,
  ): Promise<void> {
    await runUpdate(this.pool, key, [{ attribute, op: 'add', value: by }], { kind: 'none' });
  }

  // ── 4. updateItem ────────────────────────────────────────────────────────
  /**
   * Set named attributes on an existing item — a MERGE, never a replace.
   *
   * An attribute nobody named must survive: replacing would silently drop it,
   * and a test asserting only the field it set would pass. That is the shape of
   * 008's `avatarUrl` defect, which survived in seven of nine places because
   * the test looked only where its author was already looking.
   */
  protected async updateItem(
    key: Record<string, string>,
    values: Record<string, unknown>,
    condition?: string,
  ): Promise<void> {
    const writes: AttributeWrite[] = Object.entries(values).map(([attribute, value]) => ({
      attribute,
      op: 'set',
      value,
    }));
    if (writes.length === 0) return;
    await runUpdate(this.pool, key, writes, parseCondition(condition));
  }

  // ── 6. query ─────────────────────────────────────────────────────────────
  protected async query<T>(partitionKey: string, opts: QueryOptions = {}): Promise<Page<T>> {
    const pkColumn = opts.indexName ? `${opts.indexName}pk` : 'pk';
    const skColumn = opts.indexName ? `${opts.indexName}sk` : 'sk';
    const ascending = opts.ascending ?? false;
    const limit = opts.limit ?? 20;

    const where: string[] = [`${pkColumn} = $1`];
    const params: unknown[] = [partitionKey];
    const next = (): string => `$${params.length + 1}`;

    if (opts.skPrefix !== undefined) {
      where.push(`${skColumn} like ${next()} escape '\\'`);
      params.push(`${escapeLike(opts.skPrefix)}%`);
    } else if (opts.skGreaterThan !== undefined) {
      // 008/A44. Mutually exclusive with skPrefix — the old engine took one
      // sort-key condition, and offering both would silently drop one.
      where.push(`${skColumn} > ${next()}`);
      params.push(opts.skGreaterThan);
    }

    if (opts.filter) {
      const { attribute, value } = parseFilter(
        opts.filter.expression,
        opts.filter.names,
        opts.filter.values,
      );
      where.push(`item->>'${attribute}' like ${next()} escape '\\'`);
      params.push(`%${escapeLike(String(value))}%`);
    }

    /**
     * KEYSET PAGINATION, NEVER AN OFFSET.
     *
     * FR-035: paging preserves position. An offset shifts when an item is
     * inserted before it, so a concurrent publish makes a page repeat an item
     * or skip one — which is exactly the bug the requirement names, on the
     * surface where people are publishing into what you are reading.
     *
     * The comparison is over the whole key, not just the sort key: on an index
     * the sort key need not be unique, and two rows sharing one would page
     * forever or lose each other. `(gsiNsk, pk, sk)` is total because `(pk, sk)`
     * is the primary key.
     */
    const cursor = decodeCursor(opts.cursor);
    if (cursor) {
      const direction = ascending ? '>' : '<';
      const columns = opts.indexName ? [skColumn, 'pk', 'sk'] : ['sk'];
      const placeholders: string[] = [];
      for (const column of columns) {
        placeholders.push(next());
        params.push(cursor[column] ?? '');
      }
      where.push(`(${columns.join(', ')}) ${direction} (${placeholders.join(', ')})`);
    }

    const order = opts.indexName
      ? `${skColumn} ${ascending ? 'asc' : 'desc'}, pk ${ascending ? 'asc' : 'desc'}, sk ${ascending ? 'asc' : 'desc'}`
      : `sk ${ascending ? 'asc' : 'desc'}`;

    /**
     * One more than asked for, so "is there another page" is an observation
     * rather than a guess. Returning a cursor whenever a page came back full
     * would hand out a cursor to an empty page at every exact multiple of the
     * limit — an empty final page is not wrong, but it is a wasted request on
     * every scroll that happens to land evenly.
     */
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `select pk, sk, ${skColumn} as cursor_sk, item from items where ${where.join(' and ')} order by ${order} limit ${limit + 1}`,
      params,
    );

    const page = rows.slice(0, limit);
    const more = rows.length > limit;
    const last = page[page.length - 1];

    return {
      items: page.map((r) => stripKeys(r['item'] as Record<string, unknown>) as T),
      nextCursor:
        more && last
          ? encodeCursor(
              opts.indexName
                ? { [skColumn]: last['cursor_sk'], pk: last['pk'], sk: last['sk'] }
                : { sk: last['sk'] },
            )
          : null,
    };
  }

  // ── 7. transact ──────────────────────────────────────────────────────────
  /**
   * Atomic multi-item write. This is what makes 001/FR-017 possible: a
   * visibility change lands on the post item and every one of its index items,
   * or on none of them.
   *
   * A REAL `begin`/`commit`, not a loop. The loop is the obvious naive
   * translation and it is the one the contract test catches: it was the fourth
   * of six deliberate breaks in T007, and it is the failure that leaves an
   * index row claiming a visibility the post no longer has.
   */
  protected async transact(items: TransactionItems | undefined): Promise<void> {
    if (!items || items.length === 0) return;
    await runTransaction(this.pool, items);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// The statements, shared with `Transactor` so a transaction and a single write
// carry out a descriptor the SAME WAY. Two implementations of `Put` — one for
// the standalone path and one for inside a transaction — is two places for the
// condition to be got wrong, which is the shape this project keeps recording.
// ───────────────────────────────────────────────────────────────────────────

type Queryable = Pool | PoolClient;

export async function runPut(
  db: Queryable,
  item: Record<string, unknown>,
  condition?: string,
): Promise<void> {
  const columns = keyColumns(item);
  const pk = columns['pk'];
  const sk = columns['sk'];
  if (pk === null || sk === null) throw new Error('an item must carry a pk and an sk');

  const names = KEY_ATTRIBUTES.map((a) => a);
  const values = names.map((n) => columns[n]);
  const placeholders = names.map((_, i) => `$${i + 1}`);
  const itemPlaceholder = `$${names.length + 1}`;

  switch (parseCondition(condition).kind) {
    case 'must-not-exist': {
      const { rowCount } = await db.query(
        `insert into items (${names.join(', ')}, item) values (${placeholders.join(', ')}, ${itemPlaceholder})
         on conflict (pk, sk) do nothing`,
        [...values, JSON.stringify(item)],
      );
      if (rowCount === 0) throw new ConditionFailed('an item already exists at that key');
      return;
    }
    case 'must-exist': {
      const { rowCount } = await db.query(
        `update items set ${names.map((n, i) => `${n} = $${i + 1}`).join(', ')}, item = ${itemPlaceholder}
         where pk = $1 and sk = $2`,
        [...values, JSON.stringify(item)],
      );
      if (rowCount === 0) throw new ConditionFailed('no item exists at that key');
      return;
    }
    default:
      await db.query(
        `insert into items (${names.join(', ')}, item) values (${placeholders.join(', ')}, ${itemPlaceholder})
         on conflict (pk, sk) do update set ${names
           .slice(2)
           .map((n) => `${n} = excluded.${n}`)
           .join(', ')}, item = excluded.item`,
        [...values, JSON.stringify(item)],
      );
  }
}

export async function runDelete(
  db: Queryable,
  key: Record<string, unknown>,
  condition?: string,
): Promise<void> {
  const { rowCount } = await db.query('delete from items where pk = $1 and sk = $2', [
    key['pk'],
    key['sk'],
  ]);
  if (parseCondition(condition).kind === 'must-exist' && rowCount === 0) {
    throw new ConditionFailed('no item exists at that key');
  }
}

/**
 * A merge, and an UPSERT — because the old engine's `UpdateItem` is one.
 *
 * With no condition it creates the item if it is absent. That is pinned by
 * `datastore-primitives.spec.ts`, asserted against the OLD engine first, because
 * `insert ... on conflict do update` and a bare `update ... where pk = $1`
 * differ exactly here and the second silently does NOTHING: a counter that never
 * moves and an error nobody sees.
 *
 * Whether upsert is the RIGHT semantic is a separate question, and a migration
 * does not get to answer it.
 */
export async function runUpdate(
  db: Queryable,
  key: Record<string, unknown>,
  writes: AttributeWrite[],
  condition: ReturnType<typeof parseCondition>,
): Promise<void> {
  const params: unknown[] = [key['pk'], key['sk']];
  let expression = 'item';

  for (const write of writes) {
    const path = `$${params.length + 1}`;
    params.push(`{${write.attribute}}`);
    const value = `$${params.length + 1}`;
    if (write.op === 'set') {
      params.push(JSON.stringify(write.value ?? null));
      expression = `jsonb_set(${expression}, ${path}::text[], ${value}::jsonb, true)`;
    } else {
      params.push(Number(write.value));
      // `coalesce(..., 0)` is the `ADD` semantic: an attribute that was never
      // there starts from zero rather than making the whole expression null.
      /**
       * `#>>` WITH A PATH, NOT `->>` WITH A KEY — and the difference is the one
       * bug the contract test caught on this engine's first run.
       *
       * The path parameter is a text ARRAY (`{followerCount}`), which is what
       * `jsonb_set` wants. Casting the same parameter to `text` for `->>` asks
       * for a key whose NAME is the literal string `{followerCount}`, which no
       * item has — so `coalesce` supplied 0 and every add started from zero
       * instead of from what was there. Twenty concurrent increments came out
       * as 1, and `1 + -3` came out as -3.
       *
       * It is worth noticing how this failed: quietly, and in the direction
       * that still writes a plausible number. A counter lower than the rows it
       * counts is exactly the discrepancy nothing in the product would surface,
       * which is why the guarantee is a test with twenty writers rather than a
       * careful reading.
       */
      expression =
        `jsonb_set(${expression}, ${path}::text[], ` +
        `to_jsonb(coalesce((${expression} #>> ${path}::text[])::numeric, 0) + ${value}::numeric), true)`;
    }
  }

  // The key attributes belong in the stored body too, because `getItem` returns
  // `item` and the strip happens on the way out. An update that created a row
  // without them would produce an item that reads back missing its own keys.
  const seed = JSON.stringify({ pk: key['pk'], sk: key['sk'] });

  if (condition.kind === 'must-exist') {
    const { rowCount } = await db.query(
      `update items set item = ${expression} where pk = $1 and sk = $2`,
      params,
    );
    if (rowCount === 0) throw new ConditionFailed('no item exists at that key');
    return;
  }

  if (condition.kind === 'attribute-absent-or-null') {
    /**
     * `->>` RETURNS NULL FOR BOTH an absent key and a JSON null, which is
     * exactly the two cases the old engine's `attribute_not_exists(x) OR x =
     * :null` covers. One predicate, both meanings.
     *
     * REGISTERED DIFFERENCE, deliberate and safer: where the ROW is absent
     * entirely, the old engine evaluates `attribute_not_exists` against a
     * non-existent item, finds it true, and CREATES a stub. This refuses.
     * Nothing reaches it — 008's comment delete checks the comment exists and
     * is yours before building this transaction — and the two outcomes are "a
     * stub comment row nobody asked for" against "a refusal". A migration may
     * not make a product decision, so this is written down rather than assumed
     * away; it is not a decision anyone made, it is an artifact of the engine.
     */
    const { rowCount } = await db.query(
      `update items set item = ${expression}
       where pk = $1 and sk = $2 and (item ->> '${condition.attribute}') is null`,
      params,
    );
    if (rowCount === 0) {
      throw new ConditionFailed(`${condition.attribute} is already set, or no item exists`);
    }
    return;
  }

  if (condition.kind === 'must-not-exist') {
    const { rowCount } = await db.query(
      `insert into items (pk, sk, item) select $1, $2, ${expression.replace(/\bitem\b/g, `'${seed}'::jsonb`)}
       on conflict (pk, sk) do nothing`,
      params,
    );
    if (rowCount === 0) throw new ConditionFailed('an item already exists at that key');
    return;
  }

  await db.query(
    `insert into items (pk, sk, item) values ($1, $2, ${expression.replace(/\bitem\b/g, `'${seed}'::jsonb`)})
     on conflict (pk, sk) do update set item = ${expression.replace(/\bitem\b/g, 'items.item')}`,
    params,
  );
}

/** Applies every descriptor inside one `begin`/`commit`, or none of them. */
export async function runTransaction(pool: Pool, items: TransactionItems): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const descriptor of items) {
      if (descriptor.Put) {
        await runPut(client, descriptor.Put.Item ?? {}, descriptor.Put.ConditionExpression);
      } else if (descriptor.Delete) {
        await runDelete(client, descriptor.Delete.Key ?? {}, descriptor.Delete.ConditionExpression);
      } else if (descriptor.Update) {
        const writes = parseUpdateExpression(
          descriptor.Update.UpdateExpression ?? '',
          descriptor.Update.ExpressionAttributeNames,
          descriptor.Update.ExpressionAttributeValues,
        );
        await runUpdate(
          client,
          descriptor.Update.Key ?? {},
          writes,
          parseCondition(descriptor.Update.ConditionExpression),
        );
      } else {
        // Never silently. A descriptor kind nobody translated would otherwise
        // be a write that looked like it happened.
        throw new Error(`unsupported transaction item: ${JSON.stringify(descriptor)}`);
      }
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
