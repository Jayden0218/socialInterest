import { createHash } from 'node:crypto';

/**
 * The conversation id, derived from the participant pair.
 *
 * There is exactly ONE conversation per pair, by construction. That removes a
 * whole class of question: no uniqueness item, no TransactWriteItems on "open a
 * conversation", and no answer needed for "what if both people tap at once" -
 * they compute the same id and write the same partition, and the conditional
 * put makes the loser a no-op (research R8).
 *
 * Sorted, so the id cannot depend on who asked. That is asserted directly: the
 * id B computes for A must equal the id A computes for B.
 */
export function conversationIdFor(a: string, b: string): string {
  if (a === b) throw new Error('a conversation needs two different people');
  const [x, y] = [a, b].sort();
  // The separator matters. Without one, "ab" + "c" and "a" + "bc" hash to the
  // same value, and user ids are not fixed-width forever.
  // 26 hex chars: the same visual weight as the ULIDs used everywhere else, and
  // far more headroom than a product with two participants per row will need.
  return createHash('sha256').update(`${x}|${y}`).digest('hex').slice(0, 26);
}

/** Sorted, so `participantIds` is stored the way the id was derived from it. */
export function participantPair(a: string, b: string): [string, string] {
  const [x, y] = [a, b].sort();
  return [x!, y!];
}
