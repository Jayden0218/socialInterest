import type { FeedItem } from './feed.service';

export interface RankableItem extends FeedItem {
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
