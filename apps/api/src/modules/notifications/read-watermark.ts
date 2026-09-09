/**
 * 008/US2 — the read watermark.
 *
 * One item per person (`USER#<id>` / `#NOTIFREAD`) holds `lastReadAt`, and every
 * notification's `readAt` is DERIVED from it. See
 * `tests/unit/notification-read-derivation.spec.ts` for why this shape rather
 * than a per-row write or a stored counter.
 */

/**
 * "Read up to and INCLUDING the watermark".
 *
 * Inclusive on purpose: a strict comparison would leave a notification created
 * in the same millisecond as the mark permanently unread, so the count would
 * show 1 forever and nothing the person did could clear it.
 */
export function deriveReadAt(createdAt: string, lastReadAt: string | null): string | null {
  if (!lastReadAt) return null;
  return createdAt <= lastReadAt ? lastReadAt : null;
}
