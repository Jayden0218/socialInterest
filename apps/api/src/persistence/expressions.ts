/**
 * 010. Translating the datastore's expression language into SQL.
 *
 * THIS FILE EXISTS BECAUSE THE SURFACE IS SMALL, AND IT IS WORTH SAYING HOW
 * SMALL BEFORE ANYONE READS THE MIGRATION AS A REWRITE. Counted across the whole
 * persistence layer, not estimated:
 *
 *   conditions            2 distinct   attribute_not_exists(pk) ×6
 *                                      attribute_exists(pk) ×1
 *   update expressions    a bounded set — SET a = :v
 *                                        SET a = if_not_exists(a, :z) + :v
 *                                        ADD a :n
 *                                        and combinations of those
 *   query filters         1 — contains(#dn, :q) on displayNameLower
 *
 * So this is a translator for a dialect the product actually speaks, and it
 * REFUSES anything outside it rather than guessing. A translator that silently
 * ignored a clause it did not recognise would produce a write that looked like
 * it worked — which is the single worst failure available here, because the
 * totals would still pass while an answer quietly changed.
 */

/** Thrown where a condition did not hold. Mirrors the old engine's refusal. */
export class ConditionFailed extends Error {
  readonly name = 'ConditionalCheckFailedException';
  constructor(message = 'The conditional request failed') {
    super(message);
  }
}

/**
 * What a condition means to the SQL that carries it out.
 *
 * Not a fragment of SQL. `attribute_not_exists(pk)` and `attribute_exists(pk)`
 * are statements about whether the ROW is there, and the two are carried out by
 * different statements entirely — one an insert that must not conflict, the
 * other an update that must match. Returning a boolean expression would have
 * forced both into one shape and lost that.
 *
 * `attribute-absent-or-null` is the third, and it is a statement about a
 * FIELD rather than the row: 008's comment delete guards on `deletedAt`.
 */
export type RowCondition =
  | { kind: 'none' }
  | { kind: 'must-not-exist' }
  | { kind: 'must-exist' }
  | { kind: 'attribute-absent-or-null'; attribute: string };

export function parseCondition(condition: string | undefined): RowCondition {
  if (!condition) return { kind: 'none' };
  const normalised = condition.replace(/\s+/g, '');
  if (normalised === 'attribute_not_exists(pk)') return { kind: 'must-not-exist' };
  if (normalised === 'attribute_exists(pk)') return { kind: 'must-exist' };

  /**
   * `attribute_not_exists(x) OR x = :null` — "not already deleted".
   *
   * A row written before the field existed carries neither, and both mean the
   * same thing. 008/FR-028 uses it so that deleting a comment twice cannot take
   * the count below the rows.
   *
   * THIS IS THE CONDITION MY OWN COUNT MISSED, and how it was missed is worth
   * keeping: I grepped `persistence/` and reported "2 distinct conditions in the
   * whole persistence layer" — in the same session in which T007a had just
   * moved five transaction sites INTO that layer from `modules/`, where this one
   * lives. The count was taken before the move and quoted after it.
   *
   * It cost nothing, because the translator refuses what it does not recognise
   * instead of guessing. That is the whole reason it refuses: a translator that
   * silently dropped an unrecognised clause would have produced a delete that
   * looked like it worked and a count that drifted from its rows.
   */
  const absentOrNull = /^attribute_not_exists\((\w+)\)OR(\w+)=:(\w+)$/.exec(normalised);
  if (absentOrNull && absentOrNull[1] === absentOrNull[2]) {
    return { kind: 'attribute-absent-or-null', attribute: absentOrNull[1]! };
  }

  throw new Error(
    `unsupported condition: ${condition}. ` +
      'The persistence layer speaks three conditions and this is none of them. Add it ' +
      'here deliberately, with a test — do not let it through unrecognised.',
  );
}

/** One attribute's new value, expressed as a jsonb operation on `item`. */
export interface AttributeWrite {
  attribute: string;
  /** `set` replaces; `add` sums with what is there, treating absent as zero. */
  op: 'set' | 'add';
  value: unknown;
}

/**
 * Parses the update dialect into attribute writes.
 *
 * `SET a = :v, b = :w`            → two `set`s
 * `ADD a :n`                      → one `add`
 * `SET a = if_not_exists(a, :z) + :v` → one `add` (`:z` is the zero it defaults
 *                                      to, and the product only ever passes 0)
 * `SET a = :v ADD b :n`           → one of each
 *
 * Names arrive through `ExpressionAttributeNames` (`#s` → `state`) because some
 * attribute names are reserved words in the old engine; values through
 * `ExpressionAttributeValues` (`:v`).
 */
export function parseUpdateExpression(
  expression: string,
  names: Record<string, string> = {},
  values: Record<string, unknown> = {},
): AttributeWrite[] {
  const resolveName = (token: string): string => names[token] ?? token;
  const resolveValue = (token: string): unknown => {
    if (!(token in values)) {
      throw new Error(`update expression names ${token}, which has no value`);
    }
    return values[token];
  };

  const writes: AttributeWrite[] = [];

  // The two clause keywords, at the top level. Split on them rather than
  // parsing a grammar: the dialect above is the whole of what is written here,
  // and anything else must fail loudly below rather than be half-understood.
  const setMatch = /\bSET\b([\s\S]*?)(?=\bADD\b|$)/.exec(expression);
  const addMatch = /\bADD\b([\s\S]*?)(?=\bSET\b|$)/.exec(expression);

  if (setMatch?.[1]) {
    for (const assignment of splitTopLevel(setMatch[1])) {
      const [rawTarget, ...rest] = assignment.split('=');
      if (!rawTarget || rest.length === 0) {
        throw new Error(`cannot parse SET assignment: ${assignment}`);
      }
      const attribute = resolveName(rawTarget.trim());
      const rhs = rest.join('=').trim();

      // `if_not_exists(x, :z) + :v` — an add wearing a SET's clothes. The
      // product uses it for the rating aggregate, where the counters may not
      // exist yet on the place item.
      const accumulate = /^if_not_exists\(\s*([#\w]+)\s*,\s*(:\w+)\s*\)\s*\+\s*(:\w+)$/.exec(rhs);
      if (accumulate) {
        const zero = resolveValue(accumulate[2]!);
        if (zero !== 0) {
          throw new Error(
            `if_not_exists default is ${String(zero)}, and only 0 is translated. ` +
              'A non-zero default changes what the sum means; add it deliberately.',
          );
        }
        writes.push({ attribute, op: 'add', value: resolveValue(accumulate[3]!) });
        continue;
      }

      if (!/^:\w+$/.test(rhs)) {
        throw new Error(
          `unsupported SET right-hand side: ${rhs}. The persistence layer assigns ` +
            'a value or accumulates with if_not_exists, and nothing else.',
        );
      }
      writes.push({ attribute, op: 'set', value: resolveValue(rhs) });
    }
  }

  if (addMatch?.[1]) {
    for (const clause of splitTopLevel(addMatch[1])) {
      const parts = clause.trim().split(/\s+/);
      if (parts.length !== 2) throw new Error(`cannot parse ADD clause: ${clause}`);
      writes.push({
        attribute: resolveName(parts[0]!),
        op: 'add',
        value: resolveValue(parts[1]!),
      });
    }
  }

  if (writes.length === 0) throw new Error(`no SET or ADD clause in: ${expression}`);
  return writes;
}

/**
 * Splits on commas that are not inside parentheses.
 *
 * `a = :v, b = if_not_exists(b, :z) + :w` has a comma INSIDE a call, and a plain
 * `split(',')` would cut the call in half and then fail to parse either piece.
 */
function splitTopLevel(clause: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of clause) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(current);
      current = '';
    } else current += ch;
  }
  if (current.trim()) out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * The one query filter the product uses, translated.
 *
 * `contains(#dn, :q)` over `displayNameLower` — and in SQL this gets STRICTLY
 * BETTER, which is worth recording rather than leaving as a happy accident. The
 * old engine applies `Limit` to the rows it EXAMINES, before the filter runs, so
 * "look at 200 people, then filter" is not "up to 200 matches"; past that many
 * accounts a real match was invisible with the endpoint answering 200 OK and an
 * empty list. `person.repository.ts` carries a long comment about it, and it is
 * the reason `people-search-scale` has failed three times on a grown local
 * table. SQL applies `where` before `limit`, so that whole class of false
 * regression goes away.
 */
export function parseFilter(
  expression: string,
  names: Record<string, string> = {},
  values: Record<string, unknown> = {},
): { attribute: string; op: 'contains'; value: unknown } {
  const match = /^contains\(\s*([#\w]+)\s*,\s*(:\w+)\s*\)$/.exec(expression.trim());
  if (!match) {
    throw new Error(
      `unsupported filter: ${expression}. The persistence layer uses exactly one ` +
        'filter, contains(#dn, :q). Add another here deliberately, with a test.',
    );
  }
  const attribute = names[match[1]!] ?? match[1]!;
  if (!(match[2]! in values)) throw new Error(`filter names ${match[2]!}, which has no value`);
  return { attribute, op: 'contains', value: values[match[2]!] };
}
