import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/problem.filter';
import type { Viewer } from '../../visibility/visibility.filter';
import { PostQueryService } from './post-query.service';

/**
 * FR-042: a share link confers NO access of its own. It is resolved against the
 * post's CURRENT visibility, every time.
 *
 * The status codes are load-bearing, not cosmetic:
 *
 *   gone / deleted            -> 404 "No longer available"
 *   exists, viewer excluded   -> 403 "Not available to you"
 *   viewer is blocked         -> 404, deliberately indistinguishable from gone
 *
 * The block case must not be a 403: a 403 confirms the post exists, which
 * discloses the block to the person who was blocked. See the error-distinction
 * table in contracts/visibility-matrix.md.
 */
@Injectable()
export class ShareResolutionService {
  constructor(@Inject(PostQueryService) private readonly queries: PostQueryService) {}

  async resolve(viewer: Viewer, postId: string) {
    const result = await this.queries.getById(viewer, postId);
    if (!('post' in result)) {
      throw result.reason === 'gone'
        ? new DomainError(HttpStatus.NOT_FOUND, 'No longer available')
        : new DomainError(HttpStatus.FORBIDDEN, 'Not available to you');
    }
    return result;
  }

  /** Share links are stable URLs to the post itself - nothing to mint or store. */
  linkFor(postId: string, baseUrl: string): string {
    return `${baseUrl.replace(/\/$/, '')}/posts/${postId}`;
  }
}
