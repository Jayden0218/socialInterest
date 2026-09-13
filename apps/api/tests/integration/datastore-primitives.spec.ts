/**
 * 010/T006. THE SEVEN DATASTORE PRIMITIVES.
 *
 * Implements `specs/010-managed-backend/contracts/datastore-primitives.md`.
 *
 * Twenty-nine repositories depend on seven methods, and every read path in the
 * product — therefore every visibility decision — runs through them. A subtle
 * difference in any one is a defect in all twenty-nine at once, and the most
 * dangerous kind: the totals still pass while an answer quietly changes.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THIS ONE IS WATCHED **GREEN** FIRST, WHICH IS THE OPPOSITE OF THE USUAL
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Ordinary test-first does not work for a migration, because the behaviour
 * already exists — it is the ENGINE that changes. A test written after the swap
 * proves only that the new thing does what the new thing does.
 *
 * So this runs against the engine being REPLACED and is watched green there
 * (T007). That makes it a description of behaviour the product already relies
 * on rather than of an implementation nobody has written yet. Only then does the
 * engine change, and any failure afterwards is unambiguous: the new engine
 * differs, in a named way.
 *
 * A RED HERE MEANS THE TEST IS WRONG, NOT THE PRODUCT. Two assertions were wrong
 * in exactly that way while this file was being written; both are recorded at
 * the bottom, because they are corrections to the CONTRACT, not to the code.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * AND EACH GUARANTEE IS VERIFIED BY BREAKING IT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A guard that has only ever passed is not a guard. Where a guarantee is about
 * what MUST NOT happen — a lost increment, a dropped field, a widened index, a
 * half-applied transaction — the test constructs the circumstance that would
 * produce it rather than asserting the happy path and calling it proof.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { BaseRepository, type Page, type QueryOptions } from '../../src/persistence/base.repository';

/**
 * The seven methods, made callable.
 *
 * `BaseRepository`'s methods are `protected`, which is right — nothing outside a
 * repository should reach the datastore. A subclass is how a test reaches them
 * without widening the real surface, and it means this file exercises THE SAME
 * CODE the twenty-nine repositories run, not a copy of it.
 */
class Primitives extends BaseRepository {
  read<T>(key: Record<string, string>): Promise<T | null> {
    return this.getItem<T>(key);
  }
  write(item: Record<string, unknown>, condition?: string): Promise<void> {
    return this.putItem(item, condition);
  }
  remove(key: Record<string, string>): Promise<void> {
    return this.deleteItem(key);
  }
  bump(key: Record<string, string>, attribute: string, by: number): Promise<void> {
    return this.increment(key, attribute, by);
  }
  patch(
    key: Record<string, string>,
    values: Record<string, unknown>,
    condition?: string,
  ): Promise<void> {
    return this.updateItem(key, values, condition);
  }
  find<T>(partitionKey: string, opts?: QueryOptions): Promise<Page<T>> {
    return this.query<T>(partitionKey, opts);
  }
  atomically(items: TransactWriteCommandInput['TransactItems']): Promise<void> {
    return this.transact(items);
  }
}

/**
 * THE ENGINES UNDER TEST, and this list is the whole point of the file.
 *
 * One entry today. The Postgres implementation adds the second, and the
 * migration is proven when BOTH are green on the same assertions — which is what
 * the contract means by "the same tests must pass against the old engine and the
 * new one; that is the point".
 *
 * An engine is never silently skipped. If one is listed and cannot be reached,
 * the suite fails rather than reporting a green run that exercised half of what
 * its name claims — an empty list passing vacuously is the shape that made
 * `hooks-before-return.test.ts` pass over a barrel of re-exports.
 */
const ENGINES: { name: string; make: () => Primitives }[] = [
  {
    name: 'dynamodb',
    make: () => {
      const doc = DynamoDBDocumentClient.from(
        new DynamoDBClient({
          endpoint: process.env['DYNAMO_ENDPOINT'] ?? 'http://127.0.0.1:8000',
          region: process.env['DYNAMO_REGION'] ?? 'local',
          credentials: {
            accessKeyId: process.env['S3_ACCESS_KEY_ID'] ?? 'localkey',
            secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'] ?? 'localsecret',
          },
        }),
        { marshallOptions: { removeUndefinedValues: true } },
      );
      return new Primitives(doc, process.env['TABLE_NAME'] ?? 'sih-main');
    },
  },
];

describe.each(ENGINES)('datastore primitives — $name', ({ make }) => {
  const db = make();

  /**
   * A partition of its own per test.
   *
   * The local table is SHARED ACROSS RUNS and has grown to thousands of items
   * more than once — three separate "regressions" in this project were a grown
   * table, and the third one is why CLAUDE.md says to count the table before
   * believing a paging failure. A per-test partition means nothing this file
   * asserts can be perturbed by what any other run left behind.
   */
  const partition = (): string => `TEST#PRIMITIVES#${ulid()}`;

  // ── 1. getItem ───────────────────────────────────────────────────────────
  describe('getItem', () => {
    it('returns every non-key attribute exactly as stored', async () => {
      const pk = partition();
      const item = {
        pk,
        sk: '#META',
        type: 'Probe',
        text: 'a string',
        number: 42,
        zero: 0,
        no: false,
        list: ['a', 'b'],
        nested: { deep: { deeper: true } },
      };
      await db.write(item);

      const read = await db.read<typeof item>({ pk, sk: '#META' });
      expect(read).toEqual({
        type: 'Probe',
        text: 'a string',
        number: 42,
        zero: 0,
        no: false,
        list: ['a', 'b'],
        nested: { deep: { deeper: true } },
      });
    });

    /**
     * THE KEY ATTRIBUTES ARE STRIPPED, and the contract's wording needed this
     * correction rather than the code doing.
     *
     * The contract says "MUST return the item exactly as stored". Taken
     * literally that is false of the engine being replaced and of anything that
     * replaces it: `stripKeys` removes `pk`, `sk` and the ten GSI key
     * attributes on the way out, because a loaded item carrying them and then
     * re-spread over a freshly built key writes back to the OLD LOCATION. That
     * is behaviour twenty-nine repositories rely on, so it is asserted here and
     * the contract is what gets corrected.
     */
    it('strips the key attributes, so a re-spread item cannot write back to its old location', async () => {
      const pk = partition();
      await db.write({ pk, sk: '#META', gsi1pk: 'IDX#x', gsi1sk: '#META', keep: 'yes' });

      const read = await db.read<Record<string, unknown>>({ pk, sk: '#META' });
      expect(read).toEqual({ keep: 'yes' });
      for (const attribute of ['pk', 'sk', 'gsi1pk', 'gsi1sk']) {
        expect(read).not.toHaveProperty(attribute);
      }
    });

    it('answers null for something absent, and does not throw', async () => {
      // Absence is an answer the product acts on, not an error. `findByHandle`
      // returning null is how "that handle is free" is decided.
      await expect(db.read({ pk: partition(), sk: '#MISSING' })).resolves.toBeNull();
    });
  });

  // ── 2. putItem ───────────────────────────────────────────────────────────
  describe('putItem', () => {
    it('replaces the whole item, not some of it', async () => {
      const pk = partition();
      await db.write({ pk, sk: '#META', first: 'one', second: 'two' });
      await db.write({ pk, sk: '#META', first: 'changed' });

      // `second` is GONE. put replaces; update merges. Conflating the two is
      // how a partial write silently resurrects fields it was not touching,
      // which is why `updateItem` exists at all.
      expect(await db.read({ pk, sk: '#META' })).toEqual({ first: 'changed' });
    });

    /**
     * VERIFIED BY BREAKING IT: a conditional write is atomic under CONCURRENCY.
     *
     * A read-then-write implementation passes every sequential test of this and
     * fails under two simultaneous requests — which is the only circumstance the
     * condition exists for. Handle uniqueness is decided by this and nothing
     * else, so "both writes succeeded" means two people hold one handle.
     */
    it('applies its condition atomically — exactly one of five racing writers wins', async () => {
      const pk = partition();
      const results = await Promise.allSettled(
        [1, 2, 3, 4, 5].map((n) =>
          db.write({ pk, sk: '#UNIQUE', winner: n }, 'attribute_not_exists(pk)'),
        ),
      );

      const won = results.filter((r) => r.status === 'fulfilled');
      expect(won).toHaveLength(1);

      // And the survivor is the one that is actually stored — a test counting
      // only the outcomes would pass while the last writer overwrote the first.
      const stored = await db.read<{ winner: number }>({ pk, sk: '#UNIQUE' });
      expect(stored).not.toBeNull();
      expect([1, 2, 3, 4, 5]).toContain(stored!.winner);
    });

    it('refuses a second write under attribute_not_exists, and leaves the first intact', async () => {
      const pk = partition();
      await db.write({ pk, sk: '#UNIQUE', owner: 'first' }, 'attribute_not_exists(pk)');
      await expect(
        db.write({ pk, sk: '#UNIQUE', owner: 'second' }, 'attribute_not_exists(pk)'),
      ).rejects.toBeDefined();

      expect(await db.read({ pk, sk: '#UNIQUE' })).toEqual({ owner: 'first' });
    });
  });

  // ── 3. deleteItem ────────────────────────────────────────────────────────
  describe('deleteItem', () => {
    it('removes the item', async () => {
      const pk = partition();
      await db.write({ pk, sk: '#META', gone: 'soon' });
      await db.remove({ pk, sk: '#META' });
      expect(await db.read({ pk, sk: '#META' })).toBeNull();
    });

    it('succeeds when there was nothing there — delete is idempotent', async () => {
      // Callers rely on this. Block severance deletes rows that may or may not
      // exist, and a throw would turn "already gone" into a failed request.
      await expect(db.remove({ pk: partition(), sk: '#NOTHING' })).resolves.toBeUndefined();
      await expect(db.remove({ pk: partition(), sk: '#NOTHING' })).resolves.toBeUndefined();
    });
  });

  // ── 4. updateItem ────────────────────────────────────────────────────────
  describe('updateItem', () => {
    /**
     * VERIFIED BY BREAKING IT: an attribute nobody named must SURVIVE.
     *
     * A replace-instead-of-merge implementation drops it, and a test that
     * asserted only the field it had just set would pass — which is the exact
     * shape of 008's `avatarUrl` defect, alive in seven of nine places because
     * the test looked only where its author was already looking.
     */
    it('merges, and leaves attributes it was not given untouched', async () => {
      const pk = partition();
      await db.write({
        pk,
        sk: '#META',
        displayName: 'before',
        bio: 'do not lose me',
        followerCount: 7,
        nested: { keep: true },
      });

      await db.patch({ pk, sk: '#META' }, { displayName: 'after' });

      expect(await db.read({ pk, sk: '#META' })).toEqual({
        displayName: 'after',
        bio: 'do not lose me',
        followerCount: 7,
        nested: { keep: true },
      });
    });

    it('sets several attributes at once, and can add one that was never there', async () => {
      const pk = partition();
      await db.write({ pk, sk: '#META', a: 1 });
      await db.patch({ pk, sk: '#META' }, { b: 2, c: 'three' });
      expect(await db.read({ pk, sk: '#META' })).toEqual({ a: 1, b: 2, c: 'three' });
    });

    it('writes nothing at all when given no attributes', async () => {
      const pk = partition();
      await db.write({ pk, sk: '#META', untouched: true });
      await db.patch({ pk, sk: '#META' }, {});
      expect(await db.read({ pk, sk: '#META' })).toEqual({ untouched: true });
    });

    it('honours a condition, and leaves the item alone when it fails', async () => {
      const pk = partition();
      await expect(
        db.patch({ pk, sk: '#ABSENT' }, { anything: 1 }, 'attribute_exists(pk)'),
      ).rejects.toBeDefined();
      expect(await db.read({ pk, sk: '#ABSENT' })).toBeNull();
    });
  });

  // ── 5. increment ─────────────────────────────────────────────────────────
  describe('increment', () => {
    /**
     * VERIFIED BY BREAKING IT: twenty concurrent increments must all land.
     *
     * A read-modify-write loses some of them, and loses them silently — the
     * counter is simply lower than the rows it counts, which is a discrepancy
     * nothing in the product would ever surface. `interestFollowCount` shipped
     * reading zero for five features for a different reason and nobody noticed.
     */
    it('is atomic — twenty concurrent increments all count', async () => {
      const pk = partition();
      await db.write({ pk, sk: '#META', followerCount: 0 });

      await Promise.all(Array.from({ length: 20 }, () => db.bump({ pk, sk: '#META' }, 'followerCount', 1)));

      expect(await db.read<{ followerCount: number }>({ pk, sk: '#META' })).toEqual({
        followerCount: 20,
      });
    });

    it('decrements, and does not floor at zero on its own', async () => {
      // The floor, where one is wanted, is the caller's business. A primitive
      // that silently refused to go negative would hide a double-unfollow
      // rather than let a repository decide what to do about it.
      const pk = partition();
      await db.write({ pk, sk: '#META', n: 1 });
      await db.bump({ pk, sk: '#META' }, 'n', -3);
      expect(await db.read<{ n: number }>({ pk, sk: '#META' })).toEqual({ n: -2 });
    });

    it('starts from zero for an attribute that was never set', async () => {
      const pk = partition();
      await db.write({ pk, sk: '#META', other: 'x' });
      await db.bump({ pk, sk: '#META' }, 'brandNew', 5);
      expect(await db.read({ pk, sk: '#META' })).toEqual({ other: 'x', brandNew: 5 });
    });
  });

  // ── 6. query ─────────────────────────────────────────────────────────────
  describe('query', () => {
    const seed = async (pk: string, count: number): Promise<void> => {
      for (let i = 0; i < count; i++) {
        await db.write({ pk, sk: `ITEM#${String(i).padStart(3, '0')}`, i });
      }
    };

    it('returns only items in the partition it was asked about', async () => {
      const mine = partition();
      const theirs = partition();
      await seed(mine, 3);
      await seed(theirs, 3);

      const page = await db.find<{ i: number }>(mine, { limit: 50 });
      expect(page.items).toHaveLength(3);
    });

    it('orders by sort key, descending by default and ascending on request', async () => {
      const pk = partition();
      await seed(pk, 4);

      const newest = await db.find<{ i: number }>(pk, { limit: 50 });
      expect(newest.items.map((x) => x.i)).toEqual([3, 2, 1, 0]);

      const oldest = await db.find<{ i: number }>(pk, { limit: 50, ascending: true });
      expect(oldest.items.map((x) => x.i)).toEqual([0, 1, 2, 3]);
    });

    it('narrows by sort-key prefix', async () => {
      const pk = partition();
      await db.write({ pk, sk: 'POST#001', kind: 'post' });
      await db.write({ pk, sk: 'POST#002', kind: 'post' });
      await db.write({ pk, sk: 'COMMENT#001', kind: 'comment' });

      const posts = await db.find<{ kind: string }>(pk, { skPrefix: 'POST#', limit: 50 });
      expect(posts.items.map((x) => x.kind)).toEqual(['post', 'post']);
    });

    it('takes everything after a sort key', async () => {
      // 008/A44. The caller builds the full prefixed value, so the prefix still
      // bounds the scan; this only moves where it starts.
      const pk = partition();
      await seed(pk, 5);

      const after = await db.find<{ i: number }>(pk, {
        skGreaterThan: 'ITEM#002',
        limit: 50,
        ascending: true,
      });
      expect(after.items.map((x) => x.i)).toEqual([3, 4]);
    });

    it('pages with a cursor, and the pages do not overlap or skip', async () => {
      const pk = partition();
      await seed(pk, 5);

      const first = await db.find<{ i: number }>(pk, { limit: 2, ascending: true });
      expect(first.items.map((x) => x.i)).toEqual([0, 1]);
      expect(first.nextCursor).toBeTruthy();

      const second = await db.find<{ i: number }>(pk, {
        limit: 2,
        ascending: true,
        cursor: first.nextCursor,
      });
      expect(second.items.map((x) => x.i)).toEqual([2, 3]);

      const third = await db.find<{ i: number }>(pk, {
        limit: 2,
        ascending: true,
        cursor: second.nextCursor,
      });
      expect(third.items.map((x) => x.i)).toEqual([4]);
      expect(third.nextCursor).toBeNull();
    });

    /**
     * The cursor is a POSITION, not an offset.
     *
     * An offset-based cursor shifts when a row is inserted before it, so a
     * concurrent write makes a page repeat an item or skip one. This is the
     * guarantee a feed depends on while people are publishing into it.
     */
    it('holds its page boundary when an item is inserted before the cursor', async () => {
      const pk = partition();
      await seed(pk, 4);

      const first = await db.find<{ i: number }>(pk, { limit: 2, ascending: true });
      expect(first.items.map((x) => x.i)).toEqual([0, 1]);

      // Lands BEFORE the cursor. An offset would now re-serve item 1.
      await db.write({ pk, sk: 'ITEM#000a', i: 100 });

      const second = await db.find<{ i: number }>(pk, {
        limit: 2,
        ascending: true,
        cursor: first.nextCursor,
      });
      expect(second.items.map((x) => x.i)).toEqual([2, 3]);
    });

    /**
     * VERIFIED BY BREAKING IT: A SPARSE INDEX MUST STAY SPARSE.
     *
     * The contract names this one specifically, and says why: an item that does
     * not populate an index key must not appear in that index, because getting
     * it wrong WIDENS what a query returns — and a query that returns more than
     * it should is precisely the input the visibility boundary exists to be
     * protected from. The matrix would still pass: it asserts the boundary's
     * decisions, not the candidate set handed to it.
     */
    it('returns only items that populate the index, never every item in the table', async () => {
      const indexed = partition();
      const pk = partition();

      await db.write({ pk, sk: 'IN#1', gsi1pk: indexed, gsi1sk: 'A', inIndex: true });
      await db.write({ pk, sk: 'IN#2', gsi1pk: indexed, gsi1sk: 'B', inIndex: true });
      // Same base partition, NO gsi1 keys. It must be invisible to gsi1.
      await db.write({ pk, sk: 'OUT#1', inIndex: false });

      const page = await db.find<{ inIndex: boolean }>(indexed, { indexName: 'gsi1', limit: 50 });
      expect(page.items).toHaveLength(2);
      expect(page.items.every((x) => x.inIndex)).toBe(true);
    });

    it('orders and prefixes on an index sort key too', async () => {
      const indexed = partition();
      const pk = partition();
      await db.write({ pk, sk: '1', gsi1pk: indexed, gsi1sk: 'NAME#alpha', n: 1 });
      await db.write({ pk, sk: '2', gsi1pk: indexed, gsi1sk: 'NAME#beta', n: 2 });
      await db.write({ pk, sk: '3', gsi1pk: indexed, gsi1sk: 'OTHER#gamma', n: 3 });

      const named = await db.find<{ n: number }>(indexed, {
        indexName: 'gsi1',
        skPrefix: 'NAME#',
        ascending: true,
        limit: 50,
      });
      expect(named.items.map((x) => x.n)).toEqual([1, 2]);
    });

    it('answers an empty page rather than throwing for a partition with nothing in it', async () => {
      const page = await db.find(partition(), { limit: 10 });
      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeNull();
    });
  });

  // ── 7. transact ──────────────────────────────────────────────────────────
  describe('transact', () => {
    const table = process.env['TABLE_NAME'] ?? 'sih-main';

    it('applies every write together', async () => {
      const pk = partition();
      await db.atomically([
        { Put: { TableName: table, Item: { pk, sk: 'A', n: 1 } } },
        { Put: { TableName: table, Item: { pk, sk: 'B', n: 2 } } },
      ]);

      const page = await db.find<{ n: number }>(pk, { limit: 10, ascending: true });
      expect(page.items.map((x) => x.n)).toEqual([1, 2]);
    });

    /**
     * VERIFIED BY BREAKING IT: all or NONE.
     *
     * This is what makes 001/FR-017 possible — a visibility change lands on the
     * post item and every one of its index items, or on none of them. A
     * half-applied write leaves an index row claiming a visibility the post no
     * longer has, and `postInterestIndex` carries a comment calling a drifted
     * index item "exactly the SC-009 failure this class exists to make
     * impossible".
     */
    it('applies NOTHING when one item in the transaction fails its condition', async () => {
      const pk = partition();
      await db.write({ pk, sk: 'TAKEN', owner: 'first' });

      await expect(
        db.atomically([
          { Put: { TableName: table, Item: { pk, sk: 'FRESH', n: 1 } } },
          {
            Put: {
              TableName: table,
              Item: { pk, sk: 'TAKEN', owner: 'second' },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
        ]),
      ).rejects.toBeDefined();

      // The write that COULD have succeeded must not have.
      expect(await db.read({ pk, sk: 'FRESH' })).toBeNull();
      // And the one that was already there is untouched.
      expect(await db.read({ pk, sk: 'TAKEN' })).toEqual({ owner: 'first' });
    });

    it('mixes puts and deletes in one atomic unit', async () => {
      const pk = partition();
      await db.write({ pk, sk: 'OLD', n: 1 });
      await db.atomically([
        { Delete: { TableName: table, Key: { pk, sk: 'OLD' } } },
        { Put: { TableName: table, Item: { pk, sk: 'NEW', n: 2 } } },
      ]);

      expect(await db.read({ pk, sk: 'OLD' })).toBeNull();
      expect(await db.read({ pk, sk: 'NEW' })).toEqual({ n: 2 });
    });

    it('does nothing, quietly, when handed no items', async () => {
      // Callers build transaction lists from loops that can legitimately be
      // empty — an unfollow with nothing to sever, for instance.
      await expect(db.atomically([])).resolves.toBeUndefined();
      await expect(db.atomically(undefined)).resolves.toBeUndefined();
    });
  });
});

/**
 * ────────────────────────────────────────────────────────────────────────────
 * TWO CORRECTIONS TO THE CONTRACT, both found by writing this file
 * ────────────────────────────────────────────────────────────────────────────
 *
 * T007 says a red here means the test is wrong rather than the product. Twice
 * the contract was what needed fixing, which is the same thing one step up.
 *
 * 1. `getItem` does NOT "return the item exactly as stored". It strips `pk`,
 *    `sk` and the ten GSI key attributes, deliberately, so that a loaded item
 *    re-spread over a freshly built key cannot write back to its old location.
 *    Asserted above as its own test rather than glossed.
 *
 * 2. `increment` IS NOT "a read-modify-write today and says so in its own
 *    comment", which both the contract and `data-model.md` state as the reason
 *    it becomes atomic. It already uses DynamoDB's `ADD`, and
 *    `interest.repository.ts:57` says the opposite in as many words: "Atomic
 *    counter - no read-modify-write, so concurrent follows cannot race". The
 *    read-modify-write comment those documents are remembering belongs to
 *    `comment.repository.ts`, about a different operation entirely.
 *
 *    That matters beyond tidiness: it was listed as one of three deliberate
 *    behaviour CHANGES, so the new engine was licensed to differ here. It is
 *    not — atomicity is existing behaviour the product already depends on, and
 *    the twenty-writer test above holds Postgres to it rather than crediting it
 *    with an improvement it did not make.
 */
