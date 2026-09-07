import { rank, FOLLOWED_AUTHOR_BOOST_MS, type RankableItem } from '../../src/modules/feed/ranking';

const item = (over: Partial<RankableItem> & { postId: string; createdAt: string }): RankableItem => ({
  authorId: 'a',
  interestId: 'i',
  visibility: 'public',
  processingState: 'ready',
  ...over,
});

describe('feed ranking — FR-034', () => {
  it('orders by recency when nobody is followed', () => {
    const out = rank([
      item({ postId: 'old', createdAt: '2026-01-01T00:00:00Z' }),
      item({ postId: 'new', createdAt: '2026-01-02T00:00:00Z' }),
    ]);
    expect(out.map((i) => i.postId)).toEqual(['new', 'old']);
  });

  it('lifts a followed author above an unfollowed one of similar age', () => {
    const out = rank([
      item({ postId: 'stranger', createdAt: '2026-01-02T01:00:00Z' }),
      item({ postId: 'followed', createdAt: '2026-01-02T00:00:00Z', byFollowedAuthor: true }),
    ]);
    expect(out[0]!.postId).toBe('followed');
  });

  it('does not let the boost resurface genuinely old content', () => {
    // A bounded time bonus, not a multiplier: a followed author's week-old post
    // must not outrank a fresh one, or the feed stops being current.
    const out = rank([
      item({ postId: 'fresh', createdAt: '2026-01-08T00:00:00Z' }),
      item({ postId: 'stale-followed', createdAt: '2026-01-01T00:00:00Z', byFollowedAuthor: true }),
    ]);
    expect(out[0]!.postId).toBe('fresh');
  });

  it('the boost is exactly the documented window', () => {
    const base = Date.parse('2026-01-02T00:00:00Z');
    const justInside = new Date(base + FOLLOWED_AUTHOR_BOOST_MS - 1000).toISOString();
    const out = rank([
      item({ postId: 'unfollowed-newer', createdAt: justInside }),
      item({ postId: 'followed-older', createdAt: '2026-01-02T00:00:00Z', byFollowedAuthor: true }),
    ]);
    expect(out[0]!.postId).toBe('followed-older');
  });

  it('NEVER changes membership, only order', () => {
    // The constraint that matters. Ranking runs on the set FR-033 already
    // produced; if it could add or drop an item, following a person would
    // change what a feed contains and the interest focus would erode.
    const input = [
      item({ postId: 'a', createdAt: '2026-01-01T00:00:00Z' }),
      item({ postId: 'b', createdAt: '2026-01-02T00:00:00Z', byFollowedAuthor: true }),
      item({ postId: 'c', createdAt: '2026-01-03T00:00:00Z' }),
    ];
    const out = rank(input);
    expect(out).toHaveLength(input.length);
    expect(new Set(out.map((i) => i.postId))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('does not mutate its input', () => {
    const input = [
      item({ postId: 'a', createdAt: '2026-01-01T00:00:00Z' }),
      item({ postId: 'b', createdAt: '2026-01-02T00:00:00Z' }),
    ];
    const before = input.map((i) => i.postId);
    rank(input);
    expect(input.map((i) => i.postId)).toEqual(before);
  });
});
