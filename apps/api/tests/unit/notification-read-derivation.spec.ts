import { deriveReadAt } from '../../src/modules/notifications/read-watermark';

/**
 * 008/T026, US2 — `readAt` IS DERIVED FROM A WATERMARK.
 *
 * `readAt` has been declared on every notification, returned to every client,
 * and **written by nothing**, since 001. Every notification in this product has
 * been unread forever.
 *
 * The fix is one item per person holding `lastReadAt`, and `readAt` derived at
 * projection time. This codebase already uses that exact pattern for messages —
 * `ConversationRepository.markRead` writes `lastReadAt` on the participant row,
 * driven by `PUT /v1/conversations/:id/read` — so this is one pattern applied
 * twice, not a second invention.
 *
 * Two rejected alternatives, recorded because each looks reasonable:
 *
 *  - Writing `readAt` onto each row during `GET /notifications` makes a read
 *    MUTATE N rows on a hot path, and makes a GET have side effects, which
 *    breaks retry and caching for every client.
 *  - A stored unread COUNTER — which the conversation participant row does keep
 *    — is deliberately not copied. A count and the rows it counts are two
 *    sources of truth for one fact, and 005/R5 made the rating aggregate
 *    transactional precisely because they could otherwise disagree. Nothing here
 *    needs a counter to be cheap, so the count is derived and CANNOT disagree.
 *
 * The boundary is the interesting case and is why this is a unit test.
 */
describe('008/FR-005 readAt derived from the watermark', () => {
  const t = (iso: string): string => iso;

  it('is null when the person has never marked anything read', () => {
    expect(deriveReadAt(t('2026-09-09T10:00:00.000Z'), null)).toBeNull();
  });

  it('is the watermark for a notification created BEFORE it', () => {
    expect(deriveReadAt(t('2026-09-09T10:00:00.000Z'), t('2026-09-09T11:00:00.000Z')))
      .toBe('2026-09-09T11:00:00.000Z');
  });

  it('is null for a notification created AFTER it', () => {
    expect(deriveReadAt(t('2026-09-09T12:00:00.000Z'), t('2026-09-09T11:00:00.000Z'))).toBeNull();
  });

  /**
   * THE BOUNDARY, both sides, to the millisecond.
   *
   * "Read up to and including T" is the only reading that makes `markAllRead`
   * leave zero unread: a strict `<` would leave a notification created in the
   * same millisecond as the mark permanently unread, and the count would show 1
   * forever with nothing the person could do about it.
   */
  it('a notification created exactly AT the watermark is read', () => {
    expect(deriveReadAt(t('2026-09-09T11:00:00.000Z'), t('2026-09-09T11:00:00.000Z')))
      .toBe('2026-09-09T11:00:00.000Z');
  });

  it('a notification one millisecond later is not', () => {
    expect(deriveReadAt(t('2026-09-09T11:00:00.001Z'), t('2026-09-09T11:00:00.000Z'))).toBeNull();
  });

  /**
   * ISO-8601 UTC strings compare correctly as strings, which is what makes the
   * DynamoDB range query in `A44` and this function agree by construction rather
   * than by two implementations that happen to match. Pinned, because a
   * different timestamp format would silently break both at once.
   */
  it('orders lexicographically, which is what the range query relies on', () => {
    expect('2026-09-09T09:59:59.999Z' < '2026-09-09T10:00:00.000Z').toBe(true);
    expect('2026-01-01T00:00:00.000Z' < '2026-12-31T23:59:59.999Z').toBe(true);
  });
});
