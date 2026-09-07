import { Inject, Injectable } from '@nestjs/common';
import type { Visibility } from '@sih/shared';
import { BlockRepository } from '../persistence/block.repository';
import { PersonFollowRepository } from '../persistence/person-follow.repository';
import { RelationshipCache } from './relationship.cache';

/** The minimum a candidate must carry for a visibility decision. */
export interface VisibilityCandidate {
  postId: string;
  authorId: string;
  visibility: Visibility;
  processingState: 'pending' | 'processing' | 'ready' | 'failed';
  deletedAt?: string | null;
  removedByModeration?: boolean;
  /** Author account status; a non-active author has no followers for this purpose. */
  authorStatus?: 'active' | 'deleting' | 'deleted';
}

export type Viewer = { userId: string; isOperator?: boolean } | null;

export type Decision =
  | { visible: true }
  | { visible: false; reason: 'gone' | 'not_for_you' };

/**
 * THE SINGLE VISIBILITY BOUNDARY (research D6, constitution principle II).
 *
 * Every read path in every module goes through this. No module may construct its
 * own visibility predicate - FR-018 names six surfaces and SC-009 asserts no leak
 * on any of them, and six hand-written predicates is six chances to be wrong,
 * silently and in a privacy-affecting way.
 *
 * The decision table this implements is contracts/visibility-matrix.md, which is
 * a contract, not documentation, and is enforced by tests/visibility/matrix.spec.ts.
 */
@Injectable()
export class VisibilityFilter {
  constructor(
    @Inject(PersonFollowRepository) private readonly personFollows: PersonFollowRepository,
    @Inject(BlockRepository) private readonly blocks: BlockRepository,
  ) {}

  /** One cache per request. Callers create it once and pass it down. */
  newRequestCache(): RelationshipCache {
    return new RelationshipCache(this.personFollows, this.blocks);
  }

  async decide(
    viewer: Viewer,
    candidate: VisibilityCandidate,
    cache: RelationshipCache,
  ): Promise<Decision> {
    const isAuthor = viewer !== null && viewer.userId === candidate.authorId;

    // Gone for everyone, the author included.
    if (candidate.deletedAt) return { visible: false, reason: 'gone' };
    if (candidate.removedByModeration) return { visible: false, reason: 'gone' };
    /**
     * FR-003 (T157). A non-active author has no followers for visibility
     * purposes, so their followers-only content becomes inaccessible the moment
     * deletion is requested - before the purge job has removed anything. The
     * purge only has to finish eventually; it does not have to win a race.
     */
    if (candidate.authorStatus && candidate.authorStatus !== 'active') {
      return { visible: false, reason: 'gone' };
    }

    // A block overrides everything, including `public`, and in BOTH directions.
    // Reported as `gone`, not `not_for_you`: a 403 would confirm the post exists
    // and thereby disclose the block (see the contract's error-distinction table).
    if (viewer !== null && !isAuthor) {
      if (await cache.isBlockedBetween(viewer.userId, candidate.authorId)) {
        return { visible: false, reason: 'gone' };
      }
    }

    // The author sees their own post while it is still processing; nobody else does.
    if (isAuthor) return { visible: true };
    if (candidate.processingState !== 'ready') return { visible: false, reason: 'not_for_you' };

    switch (candidate.visibility) {
      case 'public':
        return { visible: true };

      case 'followers': {
        if (viewer === null) return { visible: false, reason: 'not_for_you' };
        // FR-015 resolves against the PERSON follow. Following the post's
        // INTEREST grants nothing - the second easy mistake in the contract.
        const following = await cache.isFollowing(viewer.userId, candidate.authorId);
        return following ? { visible: true } : { visible: false, reason: 'not_for_you' };
      }

      case 'private':
        return { visible: false, reason: 'not_for_you' };
    }
  }

  /** Filters a candidate set, preserving order. The list surfaces all use this. */
  async filter<T extends VisibilityCandidate>(
    viewer: Viewer,
    candidates: T[],
    cache = this.newRequestCache(),
  ): Promise<T[]> {
    const decisions = await Promise.all(candidates.map((c) => this.decide(viewer, c, cache)));
    return candidates.filter((_, i) => decisions[i]!.visible);
  }
}
