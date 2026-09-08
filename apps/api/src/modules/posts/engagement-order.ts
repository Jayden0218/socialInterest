/**
 * 004/FR-027, FR-028. "Top" within an interest space.
 *
 * MOVED HERE BY 007, unchanged. It lived in `modules/feed/ranking.ts` alongside
 * the composed feed's ordering, and 007 deletes that module - but this function
 * has nothing to do with the home feed. It orders an interest space, 004/FR-027
 * still stands, and `PostQueryService` is its only caller. Deleting it with its
 * neighbour would have removed a live requirement by side effect, which is the
 * exact failure 007's Removed Scope section exists to prevent.
 *
 * Takes the ALREADY-ADMITTED set and reorders it. It does not query, does not
 * filter, and cannot admit a post - which is the whole rule: an alternative
 * ordering may change the order and may never change the membership. 004/SC-009
 * asserts the id SETS are identical, so this is enforced by test rather than by
 * intention.
 *
 * "Within a bounded recent window" (FR-027) is a decay rather than a cut-off: a
 * hard window would DROP older posts, which would change membership - the one
 * thing this must not do. Engagement decays toward zero instead, so an old
 * popular post falls behind a new one without ever leaving the page.
 */
export const TOP_HALF_LIFE_MS = 48 * 60 * 60 * 1000;

export interface EngagedItem {
  postId: string;
  createdAt: string;
  reactionCount?: number;
  commentCount?: number;
}

export function rankByEngagement<T extends EngagedItem>(items: T[], now = Date.now()): T[] {
  return [...items].sort((a, b) => engagementScore(b, now) - engagementScore(a, now));
}

function engagementScore(item: EngagedItem, now: number): number {
  // A comment is worth more than a reaction: it costs more to leave.
  const engagement = (item.reactionCount ?? 0) + 3 * (item.commentCount ?? 0);
  const ageMs = Math.max(0, now - Date.parse(item.createdAt));
  const decay = Math.pow(0.5, ageMs / TOP_HALF_LIFE_MS);
  // The recency term breaks ties among posts with no engagement at all, so
  // "Top" on a quiet interest reads as "New" rather than as an arbitrary order.
  return engagement * decay + Date.parse(item.createdAt) / 1e13;
}
