import { RankingService } from '../../src/modules/ranking/ranking.service';
import { FOLLOWED_AUTHOR_BOOST_MS } from '../../src/modules/ranking/constants';
import type { Candidate } from '../../src/modules/ranking/candidate-source';

/**
 * 007/FR-029 — A FOLLOW REORDERS. IT NEVER WIDENS.
 *
 * This is the same constraint 001 carried, restated for a feed that no longer
 * has an interest boundary to carry it. Under the composed feed, FR-033 made
 * the claim structurally: the candidate set was the viewer's followed
 * interests, so a person-follow COULD NOT widen anything, whatever the ranker
 * did with it. That boundary is gone (RS-001), and with it the accident that
 * enforced this for free.
 *
 * What is left is a promise about the ranker: it may move a followed author's
 * post up the page, and it may not put a post on the page that would otherwise
 * not have been considered. Nothing else in the system now asserts that.
 */
describe('the followed-author boost (FR-029)', () => {
  const at = (iso: string, over: Partial<Candidate> = {}): Candidate => ({
    postId: `p-${iso}-${over.authorId ?? 'x'}`,
    authorId: 'stranger',
    interestId: 'i1',
    visibility: 'public',
    processingState: 'ready',
    createdAt: iso,
    ...over,
  });

  const build = (candidates: Candidate[], weights: Record<string, { w: number; at: string }> = {}) => {
    const collected: Candidate[] = candidates;
    const source = {
      collect: async () => ({
        candidates: collected,
        exploredInterests: ['explored-1'],
        fanOutWidth: 2,
      }),
    };
    const signals = {
      profile: async () => ({ weights, updatedAt: '2026-09-08T00:00:00.000Z' }),
      seeds: async () => [],
    };
    return new RankingService(signals as never, source as never);
  };

  const NOW = Date.parse('2026-09-08T12:00:00.000Z');

  it('moves a followed author earlier than a stranger of the same age', async () => {
    const stranger = at('2026-09-08T10:00:00.000Z', { authorId: 'stranger' });
    const friend = at('2026-09-08T10:00:00.000Z', { authorId: 'friend' });

    // Ordered stranger-first going in, so a pass-through would fail this.
    const ranking = build([stranger, friend]);
    const { candidates } = await ranking.rank('viewer', 10, new Set(['friend']), NOW);

    expect(candidates.map((c) => c.authorId)).toEqual(['friend', 'stranger']);
  });

  it('is BOUNDED — the boost flips a gap just inside it and not one just outside', async () => {
    // BOTH HALVES, because either alone passes for the wrong reason. "Does not
    // flip beyond the bound" is satisfied by no boost at all; "flips within it"
    // is satisfied by an unbounded one. An unbounded boost turns the ranked
    // feed back into a follower feed, which is the failure FR-029 sits beside.
    const fresh = at(new Date(NOW).toISOString(), { authorId: 'stranger' });

    const inside = at(new Date(NOW - FOLLOWED_AUTHOR_BOOST_MS + 60_000).toISOString(), {
      authorId: 'friend',
    });
    const within = await build([fresh, inside]).rank('viewer', 10, new Set(['friend']), NOW);
    expect(within.candidates.map((c) => c.authorId)).toEqual(['friend', 'stranger']);

    const outside = at(new Date(NOW - FOLLOWED_AUTHOR_BOOST_MS - 60_000).toISOString(), {
      authorId: 'friend',
    });
    const beyond = await build([fresh, outside]).rank('viewer', 10, new Set(['friend']), NOW);
    expect(beyond.candidates.map((c) => c.authorId)).toEqual(['stranger', 'friend']);
  });

  it('NEVER WIDENS — the ranked set is exactly what the source proposed', async () => {
    const proposed = [
      at('2026-09-08T09:00:00.000Z', { authorId: 'stranger' }),
      at('2026-09-08T08:00:00.000Z', { authorId: 'other' }),
    ];

    // 'friend' is followed and has published nothing the source proposed. If a
    // follow could admit a post, this is where it would appear.
    const ranking = build(proposed);
    const { candidates } = await ranking.rank('viewer', 10, new Set(['friend']), NOW);

    expect(candidates).toHaveLength(proposed.length);
    expect(new Set(candidates.map((c) => c.postId))).toEqual(new Set(proposed.map((c) => c.postId)));
  });

  it('does not consume the exploration share', async () => {
    // FR-007 sizes exploration from the PAGE, not from what is left after
    // follows are served. The boost reorders the collected set and cannot
    // change what was collected, so a viewer who follows fifty people still
    // gets the same explored partitions.
    const source = {
      collect: jest.fn(async () => ({
        candidates: [at('2026-09-08T09:00:00.000Z', { authorId: 'friend' })],
        exploredInterests: ['explored-1'],
        fanOutWidth: 2,
      })),
    };
    const signals = { profile: async () => null, seeds: async () => ['i1'] };
    const ranking = new RankingService(signals as never, source as never);

    await ranking.rank('viewer', 20, new Set(['friend', 'friend2']), NOW);
    const [, limitArg] = source.collect.mock.calls[0] as unknown as [string[], number];
    expect(limitArg).toBe(20);
  });
});
