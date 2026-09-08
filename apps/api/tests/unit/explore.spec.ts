import { CandidateSource } from '../../src/modules/ranking/candidate-source';
import { chooseExploreInterests, exploreCount } from '../../src/modules/ranking/explore';
import { EXPLORE_EPSILON } from '../../src/modules/ranking/constants';

/**
 * 007/SC-004 AND FR-007 — THE FEED CANNOT COLLAPSE.
 *
 * Stated as a property of a HUNDRED consecutive responses rather than of one,
 * because the failure this guards is not "a page was monotonous". It is that a
 * purely exploitative ranker is a positive feedback loop: it shows what the
 * profile favours, the profile is updated only from what was shown, and the
 * signals that would broaden it are therefore never generated. One page proves
 * nothing about a loop; a hundred consecutive pages, none of which is a single
 * interest, is the shape of the claim.
 *
 * The viewer here is the worst case on purpose - every signal points at one
 * interest, which is exactly the account a collapsed feed produces.
 */
describe('exploration keeps a feed from collapsing (FR-007, SC-004)', () => {
  const CATALOGUE = Array.from({ length: 40 }, (_, i) => `i${i}`);
  const OBSESSION = 'i0';

  const source = (): CandidateSource => {
    const index = {
      // Every partition holds posts, so a response that is entirely one
      // interest is a choice by the source and never a shortage of material.
      listByInterest: async (interestId: string, opts: { limit?: number }) => ({
        items: Array.from({ length: opts.limit ?? 20 }, (_, n) => ({
          postId: `${interestId}-${n}`,
          authorId: `a-${interestId}`,
          interestId,
          visibility: 'public' as const,
          processingState: 'ready' as const,
          createdAt: new Date(Date.parse('2026-09-08T00:00:00.000Z') - n * 60_000).toISOString(),
        })),
        nextCursor: null,
      }),
    };
    const catalogue = { allIds: () => CATALOGUE };
    return new CandidateSource(index as never, catalogue as never);
  };

  it('no response out of 100 is entirely the one interest the viewer engages with', async () => {
    const collector = source();
    const monotonous: number[] = [];

    for (let page = 0; page < 100; page++) {
      const { candidates } = await collector.collect([OBSESSION], 20);
      const interests = new Set(candidates.map((c) => c.interestId));
      if (interests.size === 1 && interests.has(OBSESSION)) monotonous.push(page);
    }

    // Zero, not "few". A single collapsed response is a viewer whose profile
    // got no chance to broaden on that page.
    expect(monotonous).toEqual([]);
  });

  it('explores different interests from one page to the next', async () => {
    // A fixed exploration set would satisfy the assertion above and still be a
    // loop, one interest wider. The share has to MOVE.
    const collector = source();
    const seen = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const { exploredInterests } = await collector.collect([OBSESSION], 20);
      for (const id of exploredInterests) seen.add(id);
    }
    expect(seen.size).toBeGreaterThan(exploreCount(20));
  });

  it('the exploration share is sized from the page and rounds UP, never to zero', () => {
    expect(exploreCount(20)).toBe(Math.round(20 * EXPLORE_EPSILON));
    // A page small enough to round its share to zero is a page that cannot
    // broaden anything - so the floor is one, and it is the floor that matters.
    expect(exploreCount(1)).toBe(1);
    expect(exploreCount(2)).toBe(1);
  });

  it('never explores an interest the viewer already favours', () => {
    // Otherwise the share is spent confirming the profile, which is the loop
    // wearing the clothes of a fix.
    const exploited = ['i0', 'i1', 'i2'];
    for (let i = 0; i < 50; i++) {
      const picked = chooseExploreInterests(CATALOGUE, exploited, 4);
      expect(picked.filter((id) => exploited.includes(id))).toEqual([]);
    }
  });

  it('returns what it can when the catalogue is smaller than the share', () => {
    // The degenerate case a new deployment is in. It must not loop forever
    // trying to sample four distinct interests out of two.
    expect(chooseExploreInterests(['a', 'b'], ['a'], 5)).toEqual(['b']);
    expect(chooseExploreInterests(['a'], ['a'], 5)).toEqual([]);
  });
});
