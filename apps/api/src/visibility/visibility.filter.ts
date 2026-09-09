import { Inject, Injectable } from '@nestjs/common';
import type { Visibility } from '@sih/shared';
import { BlockRepository } from '../persistence/block.repository';
import { PersonFollowRepository } from '../persistence/person-follow.repository';
import { PersonRepository } from '../persistence/person.repository';
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

/** The minimum ANY author-attributed content must carry. A post is a superset. */
export interface AuthoredCandidate {
  authorId: string;
  deletedAt?: string | null;
  removedByModeration?: boolean;
  authorStatus?: 'active' | 'deleting' | 'deleted';
}

/**
 * THE RULES EVERY AUTHOR-ATTRIBUTED THING SHARES, in one function.
 *
 * Returns a Decision when these rules settle it, and `null` when they do not -
 * meaning the caller's own rules take over. A post then evaluates its audience;
 * a review has none and is simply visible.
 *
 * WHY THIS EXISTS RATHER THAN A SECOND PREDICATE (005/R4). Principle II's whole
 * rationale is that "six independently written predicates give six chances to
 * leak". Reviews need blocks, deletion and author status - a strict subset of
 * the post rules - and the tempting shortcut is a second small check inside the
 * review path. Two checks that agree today are one refactor away from
 * disagreeing, and the disagreement is silent and privacy-affecting.
 *
 * So `decide()` DELEGATES here rather than keeping its own copy. The post path
 * cannot drift from the review path because there is nothing to drift from.
 * `authored-content.ts` calls this too and is forbidden from importing
 * BlockRepository, which is asserted by a unit test.
 */
export async function decideAuthoredRules(
  viewer: Viewer,
  candidate: AuthoredCandidate,
  cache: RelationshipCache,
): Promise<Decision | null> {
  const isAuthor = viewer !== null && viewer.userId === candidate.authorId;

  // Gone for everyone, the author included.
  if (candidate.deletedAt) return { visible: false, reason: 'gone' };
  if (candidate.removedByModeration) return { visible: false, reason: 'gone' };
  /**
   * FR-003 (T157). A non-active author has no followers for visibility purposes,
   * so their followers-only content becomes inaccessible the moment deletion is
   * requested - before the purge job has removed anything. The purge only has to
   * finish eventually; it does not have to win a race.
   */
  if (candidate.authorStatus && candidate.authorStatus !== 'active') {
    return { visible: false, reason: 'gone' };
  }

  // A block overrides everything, including `public`, and in BOTH directions.
  // Reported as `gone`, not `not_for_you`: a 403 would confirm the content exists
  // and thereby disclose the block (see the contract's error-distinction table).
  if (viewer !== null && !isAuthor) {
    if (await cache.isBlockedBetween(viewer.userId, candidate.authorId)) {
      return { visible: false, reason: 'gone' };
    }
  }

  return null;
}

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
    /**
     * 008/FR-043. The boundary reads the author's privacy ITSELF — see
     * `RelationshipCache.isPrivateAccount` for why no surface may be asked to
     * carry it on a candidate.
     */
    @Inject(PersonRepository) private readonly people: PersonRepository,
  ) {}

  /** One cache per request. Callers create it once and pass it down. */
  newRequestCache(): RelationshipCache {
    return new RelationshipCache(this.personFollows, this.blocks, this.people);
  }

  async decide(
    viewer: Viewer,
    candidate: VisibilityCandidate,
    cache: RelationshipCache,
  ): Promise<Decision> {
    const isAuthor = viewer !== null && viewer.userId === candidate.authorId;

    /**
     * The rules that apply to ANY author-attributed content, applied first.
     *
     * Delegated rather than duplicated - see decideAuthoredRules below. This
     * call is what makes reviews and posts share one predicate instead of two
     * that agree today (005/R4, constitution principle II).
     */
    const shared = await decideAuthoredRules(viewer, candidate, cache);
    if (shared) return shared;

    // The author sees their own post while it is still processing; nobody else does.
    if (isAuthor) return { visible: true };
    if (candidate.processingState !== 'ready') return { visible: false, reason: 'not_for_you' };

    /**
     * 008/FR-043, FR-044 — A PRIVATE ACCOUNT, AS ONE CLAUSE.
     *
     * A private author's `public` post is evaluated by the `followers` rule.
     * That is the whole implementation: no surface checks privacy, no index is
     * rebuilt, and FR-044's "takes effect on the next read everywhere" is free
     * because the boundary already runs per request (001/FR-017).
     *
     * The read happens only here, and only when it can change the answer: the
     * author already returned above, and a post that is not `public` is decided
     * by its own rule whatever the account says.
     *
     * FR-045 (existing followers keep access) falls out of it as well — the
     * `followers` case reads the follow that is already there, and nothing about
     * flipping privacy touches follow rows.
     */
    const effectiveVisibility =
      candidate.visibility === 'public' && (await cache.isPrivateAccount(candidate.authorId))
        ? 'followers'
        : candidate.visibility;

    switch (effectiveVisibility) {
      case 'public':
        return { visible: true };

      case 'followers': {
        if (viewer === null) return { visible: false, reason: 'not_for_you' };
        /**
         * FR-015 resolves against the PERSON follow. Following the post's
         * INTEREST grants nothing - the second easy mistake in the contract.
         *
         * 008/FR-043: and only an ACCEPTED follow. A pending request is somebody
         * asking; treating it as a follow would make the request pointless.
         */
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
