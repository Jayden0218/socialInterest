import { Controller, HttpStatus, Inject, Param, Post, Req } from '@nestjs/common';
import { DomainError } from '../../common/errors/problem.filter';
import type { AppRequest } from '../../common/http/request';
import { PostQueryService } from '../posts/post-query.service';
import { ShareResolutionService } from '../posts/share-resolution.service';

@Controller('posts')
export class ShareController {
  constructor(
    @Inject(PostQueryService) private readonly queries: PostQueryService,
    @Inject(ShareResolutionService) private readonly share: ShareResolutionService,
  ) {}

  /**
   * FR-041. The link is issued only to someone who can already see the post, and
   * it grants nothing: resolution re-checks visibility every time (FR-042).
   *
   * `visibility` is echoed back so the client can warn that a followers-only
   * link will not open for everyone the person sends it to.
   */
  @Post(':postId/share-link')
  async create(@Req() req: AppRequest, @Param('postId') postId: string) {
    const result = await this.queries.getById(req.viewer ?? null, postId);
    if (!('post' in result)) {
      throw result.reason === 'gone'
        ? new DomainError(HttpStatus.NOT_FOUND, 'No longer available')
        : new DomainError(HttpStatus.FORBIDDEN, 'Not available to you');
    }
    return {
      url: this.share.linkFor(postId, `${req.protocol}://${req.get('host')}/v1`),
      visibility: result.post.visibility,
    };
  }
}
