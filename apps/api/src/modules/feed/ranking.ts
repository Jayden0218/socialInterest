import type { FeedCandidate } from './feed.service';

export interface RankableItem extends FeedCandidate {
  /** Set by the feed once it knows who the viewer follows. */
  byFollowedAuthor?: boolean;
}

/**
 * FR-034: posts by followed people rank above posts by unfollowed authors
 * WITHIN the same interest.
 *
 * The constraint that matters is the one this does NOT do: it never admits a
 * post. Ranking operates on the set the FR-033 intersection already produced,
 * so prominence can reorder a feed but can never widen it. Constitution
 * principle I - a person-follow must not pull in content from an interest the
 * viewer has not chosen.
 */
export const FOLLOWED_AUTHOR_BOOST_MS = 6 * 60 * 60 * 1000;

export function rank(items: RankableItem[]): RankableItem[] {
  return [...items].sort((a, b) => score(b) - score(a));
}

/**
 * Recency, with a bounded boost for followed authors. Expressed as a time
 * bonus rather than a multiplier so the effect is legible: a followed author's
 * post competes as though it were six hours newer, and no boost can resurface
 * genuinely old content indefinitely.
 */
function score(item: RankableItem): number {
  const base = Date.parse(item.createdAt);
  return base + (item.byFollowedAuthor ? FOLLOWED_AUTHOR_BOOST_MS : 0);
}

/**
 * 004/FR-027, FR-028. "Top" within an interest space.
 *
 * Takes the ALREADY-ADMITTED set and reorders it. It does not query, does not
 * filter, and cannot admit a post - which is the whole rule: an alternative
 * ordering may change the order and may never change the membership. SC-009
 * asserts the id SETS are identical, so this is enforced by test rather than by
 * intention.
 *
 * "Within a bounded recent window" (FR-027) is a decay rather than a cut-off:
 * a hard window would DROP older posts, which would change membership - the one
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
