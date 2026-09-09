import { Inject, Injectable } from '@nestjs/common';
import { PostInterestIndexRepository } from '../../persistence/post-interest-index.repository';
import { CATALOGUE_SEARCH, type CatalogueSearch } from '../interests/catalogue.cache';
import { chooseExploreInterests, exploreCount } from './explore';

export interface Candidate {
  postId: string;
  authorId: string;
  interestId: string;
  visibility: 'public' | 'followers' | 'private';
  processingState: 'pending' | 'processing' | 'ready' | 'failed';
  createdAt: string;
}

/**
 * WHERE CANDIDATES COME FROM (research R1).
 *
 * The EXISTING post-interest index, read across two sets of partitions: the
 * interests the viewer's profile favours, and an exploration sample. No new
 * index, no new write on the publish path, and the bounded fan-in 001 measured
 * still applies.
 *
 * This class proposes. It does not decide - it has no idea who the viewer is
 * beyond their weighted interests, and it never asks whether a post may be
 * shown. `ranking-cannot-admit.spec.ts` fails the build if that changes.
 */
@Injectable()
export class CandidateSource {
  private static readonly PER_INTEREST_OVERFETCH = 2;
  /** Bounds on the top-up below. A feed request must not walk the catalogue. */
  private static readonly TOP_UP_ROUNDS = 4;
  private static readonly TOP_UP_WIDTH = 8;
  private static readonly MAX_FAN_OUT = 40;

  constructor(
    @Inject(PostInterestIndexRepository) private readonly index: PostInterestIndexRepository,
    @Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch,
  ) {}

  /**
   * 008/FR-039, FR-041 — MUTE AND DISMISSAL ARE APPLIED HERE, IN SELECTION.
   *
   * `contracts/selection-vs-boundary.md`: the question is whether the rule
   * changes the answer to *may this viewer see this post* on EVERY surface,
   * including the author's own profile. For both of these it does not — a muted
   * person's profile is not empty and a dismissed post still opens from a link
   * — so they belong to the ranker and MUST NOT reach `VisibilityFilter`.
   * `selection-not-boundary.spec.ts` fails the build if they ever do.
   */
  async collect(
    exploitInterests: string[],
    limit: number,
    depth = 0,
    exclude: { authorIds?: Set<string>; postIds?: Set<string> } = {},
  ): Promise<{ candidates: Candidate[]; exploredInterests: string[]; fanOutWidth: number }> {
    const catalogueIds = this.catalogue.allIds();

    // FR-007: the exploration share is computed from the page size, so it
    // cannot be squeezed out by a viewer with a dense profile.
    const explored = chooseExploreInterests(
      catalogueIds,
      exploitInterests,
      exploreCount(limit),
    );

    /**
     * A viewer with no profile and no seeds still gets a feed (FR-015). Without
     * this the first request after a skipped cold start returns nothing, which
     * is the first impression the product makes.
     */
    const partitions = [...new Set([...exploitInterests, ...explored])];
    const effective = partitions.length > 0 ? partitions : catalogueIds.slice(0, 12);

    /**
     * Each page reads further into every partition. The feed then discards what
     * this session has already shown, so without deepening page two would be
     * page one minus itself - a page that shrinks to nothing while the
     * catalogue still holds posts.
     */
    const perInterest =
      Math.max(3, Math.ceil(limit / 2)) * CandidateSource.PER_INTEREST_OVERFETCH * (depth + 1);

    const seen = new Set<string>();
    const candidates: Candidate[] = [];
    const read = new Set<string>();

    const readPartitions = async (ids: string[]): Promise<void> => {
      const fresh = ids.filter((id) => !read.has(id));
      for (const id of fresh) read.add(id);
      const pages = await Promise.all(
        fresh.map((interestId) =>
          this.index
            .listByInterest(interestId, { limit: perInterest })
            .catch(() => ({ items: [], nextCursor: null })),
        ),
      );
      for (const page of pages) {
        for (const item of page.items) {
          // De-duplicate: FR-024 writes an index item per interest, so a post
          // filed under a sub-interest and its parent appears twice.
          if (seen.has(item.postId)) continue;
          seen.add(item.postId);
          const candidate = item as Candidate;
          // Dropped BEFORE ranking rather than filtered after: a dismissed post
          // consuming a slot in the page would make "not this one again" mean
          // "one fewer post", which is not what it says.
          if (exclude.authorIds?.has(candidate.authorId)) continue;
          if (exclude.postIds?.has(candidate.postId)) continue;
          candidates.push(candidate);
        }
      }
    };

    await readPartitions(effective);

    /**
     * TOP-UP, AND IT IS FR-015 RATHER THAN AN OPTIMISATION.
     *
     * Found by running it. A viewer with nothing declared draws four random
     * interests out of a catalogue of hundreds, MOST OF WHICH HOLD NO POSTS -
     * so the honest sample came back empty and the feed with it. Every unit
     * test passed, because they stub an index where every partition is
     * populated; the emptiness only exists against a real sparse catalogue.
     *
     * So an under-filled page reads MORE PARTITIONS rather than giving up.
     * Bounded twice over - a fixed number of rounds and a fixed fan-out ceiling
     * - because the failure this must not trade for is a feed request that
     * walks the whole catalogue when the catalogue is genuinely empty.
     */
    const target = limit * 3;
    for (let round = 0; candidates.length < target && round < CandidateSource.TOP_UP_ROUNDS; round++) {
      if (read.size >= CandidateSource.MAX_FAN_OUT) break;
      const more = chooseExploreInterests(catalogueIds, [...read], CandidateSource.TOP_UP_WIDTH);
      if (more.length === 0) break;
      await readPartitions(more);
    }

    return { candidates, exploredInterests: explored, fanOutWidth: read.size };
  }
}
