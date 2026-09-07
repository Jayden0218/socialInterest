import { Inject, Injectable } from '@nestjs/common';
import {
  VisibilityFilter,
  decideAuthoredRules,
  type AuthoredCandidate,
  type Decision,
  type Viewer,
} from './visibility.filter';
import type { RelationshipCache } from './relationship.cache';

/**
 * THE SECOND ENTRY POINT TO THE ONE VISIBILITY BOUNDARY (005/R4).
 *
 * For author-attributed content that has NO audience setting: a review today,
 * and anything later that is "visible to whoever can see the page it sits on".
 *
 * WHY NOT JUST CALL decide()? Because `VisibilityCandidate` requires `postId`,
 * `visibility` and `processingState`, and a review has none of them. Passing
 * `{ postId: reviewId, visibility: 'public', processingState: 'ready' }` would
 * invent three fields to satisfy a signature - and inventing fields to fit a
 * shape is the defect this codebase has shipped seven times, most recently as
 * persistence rows escaping as API responses. It would also add branches to the
 * post decision table for states a post cannot be in.
 *
 * WHY NOT A REVIEW-SPECIFIC CHECK IN places/ OR ratings/? That is 001/D6 again.
 * `VisibilityFilter` is top-level rather than a helper inside `posts/` precisely
 * because a visibility check inlined next to its caller is one nobody finds
 * later. The same reasoning puts this file here.
 *
 * THIS FILE MUST NOT IMPORT BlockRepository, and a unit test asserts that. The
 * block question is answered once, in `decideAuthoredRules`, which `decide()`
 * also delegates to. Two entry points each reading blocks would be exactly the
 * two predicates principle II forbids - and they would pass every assertion in
 * the matrix while being one refactor away from disagreeing.
 */
@Injectable()
export class AuthoredContentVisibility {
  // Injected only for its request cache, so blocks are read once per request
  // across both entry points rather than once per entry point.
  constructor(@Inject(VisibilityFilter) private readonly posts: VisibilityFilter) {}

  /** One cache per request, shared with the post path so blocks are read once. */
  newRequestCache(): RelationshipCache {
    return this.posts.newRequestCache();
  }

  /**
   * Visible unless the shared rules say otherwise.
   *
   * The `?? { visible: true }` is the whole difference from a post: there is no
   * audience left to evaluate. A review is as visible as the place page it sits
   * on, which is why `reviewSchema` has no `visibility` field to consult.
   */
  async decide(
    viewer: Viewer,
    candidate: AuthoredCandidate,
    cache: RelationshipCache,
  ): Promise<Decision> {
    return (await decideAuthoredRules(viewer, candidate, cache)) ?? { visible: true };
  }

  /** Filters a candidate set, preserving order. */
  async filter<T extends AuthoredCandidate>(
    viewer: Viewer,
    candidates: T[],
    cache = this.newRequestCache(),
  ): Promise<T[]> {
    const decisions = await Promise.all(candidates.map((c) => this.decide(viewer, c, cache)));
    return candidates.filter((_, i) => decisions[i]!.visible);
  }
}
