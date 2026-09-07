import { ulid } from 'ulid';
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

/**
 * A GROUP's id (005/R1). A ULID, like every other entity here.
 *
 * NOT derived from the participant set, and the reason is structural rather than
 * awkward: FR-020 lets somebody be added to an existing group, and a derived id
 * would CHANGE when they were. The conversation everyone was reading would cease
 * to exist and a new empty one would appear, and every message would have to be
 * rewritten under the new key on every add.
 *
 * The idempotency the derived id buys is also not something a group needs.
 * "Open a conversation with Sam" is a lookup that should always land in the same
 * place; "start a group with Sam, Alex and Jo" is a deliberate act of creation,
 * and doing it twice genuinely means two groups - the way two documents with the
 * same title are two documents.
 */
export function newGroupConversationId(): string {
  return ulid();
}
