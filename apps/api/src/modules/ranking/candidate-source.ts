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

  constructor(
    @Inject(PostInterestIndexRepository) private readonly index: PostInterestIndexRepository,
    @Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch,
  ) {}

  async collect(
    exploitInterests: string[],
    limit: number,
    depth = 0,
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
    const pages = await Promise.all(
      effective.map((interestId) =>
        this.index
          .listByInterest(interestId, { limit: perInterest })
          .catch(() => ({ items: [], nextCursor: null })),
      ),
    );

    // De-duplicate: FR-024 writes an index item per interest, so a post filed
    // under a sub-interest and its parent appears twice.
    const seen = new Set<string>();
    const candidates: Candidate[] = [];
    for (const page of pages) {
      for (const item of page.items) {
        if (seen.has(item.postId)) continue;
        seen.add(item.postId);
        candidates.push(item as Candidate);
      }
    }

    return { candidates, exploredInterests: explored, fanOutWidth: effective.length };
  }
}
