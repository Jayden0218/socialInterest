import { VisibilityFilter, type VisibilityCandidate } from '../../src/visibility/visibility.filter';
import type { PersonFollowRepository } from '../../src/persistence/person-follow.repository';
import type { BlockRepository } from '../../src/persistence/block.repository';

/**
 * The two mistakes contracts/visibility-matrix.md names explicitly. Both are
 * silent and privacy-affecting, so they get their own test rather than relying
 * on the generated matrix to happen to cover them.
 */
const AUTHOR = 'author-1';
const base: VisibilityCandidate = {
  postId: 'p1',
  authorId: AUTHOR,
  visibility: 'public',
  processingState: 'ready',
  authorStatus: 'active',
};

const makeFilter = (opts: {
  follows?: (a: string, b: string) => boolean;
  blocked?: (a: string, b: string) => boolean;
}) =>
  new VisibilityFilter(
    { isFollowing: async (a: string, b: string) => opts.follows?.(a, b) ?? false } as unknown as PersonFollowRepository,
    { existsBetween: async (a: string, b: string) => opts.blocked?.(a, b) ?? false } as unknown as BlockRepository,
  );

describe('VisibilityFilter — mistake 1: a block must hide in BOTH directions', () => {
  it('hides a public post when the AUTHOR blocked the viewer', async () => {
    const f = makeFilter({ blocked: (a, b) => [a, b].includes('viewer') && [a, b].includes(AUTHOR) });
    const d = await f.decide({ userId: 'viewer' }, base, f.newRequestCache());
    expect(d.visible).toBe(false);
  });

  it('hides a public post when the VIEWER blocked the author', async () => {
    // Same assertion from the other direction. Testing only one is the mistake.
    const f = makeFilter({ blocked: (a, b) => [a, b].includes(AUTHOR) && [a, b].includes('viewer') });
    const d = await f.decide({ userId: 'viewer' }, base, f.newRequestCache());
    expect(d.visible).toBe(false);
  });

  it('reports a block as `gone`, never `not_for_you`', async () => {
    // A 403 would confirm the post exists and so disclose the block.
    const f = makeFilter({ blocked: () => true });
    const d = await f.decide({ userId: 'viewer' }, base, f.newRequestCache());
    expect(d).toEqual({ visible: false, reason: 'gone' });
  });
});

describe('VisibilityFilter — mistake 2: following an INTEREST grants nothing', () => {
  const followersOnly: VisibilityCandidate = { ...base, visibility: 'followers' };

  it('hides a followers-only post from someone who follows the interest but not the person', async () => {
    // The filter has no access to interest follows at all, by design. This test
    // pins that: only the PERSON follow (FR-015) can make the decision true.
    const f = makeFilter({ follows: () => false });
    const d = await f.decide({ userId: 'interest-follower' }, followersOnly, f.newRequestCache());
    expect(d).toEqual({ visible: false, reason: 'not_for_you' });
  });

  it('shows a followers-only post to a person-follower', async () => {
    const f = makeFilter({ follows: (a, b) => a === 'fan' && b === AUTHOR });
    const d = await f.decide({ userId: 'fan' }, followersOnly, f.newRequestCache());
    expect(d.visible).toBe(true);
  });
});

describe('VisibilityFilter — request cache', () => {
  it('reads each author relationship once per request, not once per post', async () => {
    let followCalls = 0;
    const f = new VisibilityFilter(
      { isFollowing: async () => { followCalls++; return true; } } as unknown as PersonFollowRepository,
      { existsBetween: async () => false } as unknown as BlockRepository,
    );
    const cache = f.newRequestCache();
    const posts = Array.from({ length: 20 }, (_, i) => ({
      ...base, postId: `p${i}`, visibility: 'followers' as const,
    }));
    await f.filter({ userId: 'fan' }, posts, cache);
    expect(followCalls).toBe(1);
  });
});
