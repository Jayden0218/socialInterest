import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import type { AppRequest } from '../../common/http/request';
import { Public } from '../../common/auth/auth.guard';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import { zodBody } from '../../common/http/validation';
import { ReactionService } from './reaction.service';
import { CommentService } from './comment.service';

const commentSchema = z.object({
  body: z.string().min(1).max(1000),
  /** 008/FR-023. Absent means a top-level comment; the service resolves it. */
  parentCommentId: z.string().optional(),
});

@Controller('posts')
export class EngagementController {
  constructor(
    @Inject(ReactionService) private readonly reactions: ReactionService,
    @Inject(CommentService) private readonly comments: CommentService,
  ) {}

  /** FR-039. Idempotent - a double-tap cannot inflate the count. */
  @Put(':postId/reaction')
  async react(@Req() req: AppRequest, @Param('postId') postId: string) {
    return this.reactions.react(postId, req.viewer!.userId);
  }

  @Delete(':postId/reaction')
  async unreact(@Req() req: AppRequest, @Param('postId') postId: string) {
    return this.reactions.unreact(postId, req.viewer!.userId);
  }

  /** FR-040. Readable exactly when the post is. */
  @Public()
  @Get(':postId/comments')
  async list(
    @Req() req: AppRequest,
    @Param('postId') postId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const page = await this.comments.list(req.viewer ?? null, postId, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit))) : 20,
      cursor: cursor ?? null,
    });
    return { items: page.items, page: { nextCursor: page.nextCursor, emptyStateHint: null } };
  }

  @Post(':postId/comments')
  @RateLimit({ capacity: 20, refillPerSecond: 0.3 })
  async comment(@Req() req: AppRequest, @Param('postId') postId: string, @Body() body: unknown) {
    const input = zodBody(commentSchema, body);
    return this.comments.create(req.viewer!, postId, input.body, input.parentCommentId ?? null);
  }
}
