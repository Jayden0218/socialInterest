import { Body, Controller, Get, HttpStatus, Inject, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { visibilitySchema } from '@sih/shared';
import { DomainError } from '../../common/errors/problem.filter';
import type { AppRequest } from '../../common/http/request';
import { zodBody } from '../../common/http/validation';
import { Public } from '../../common/auth/auth.guard';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import { PostService } from './post.service';
import { PostQueryService } from './post-query.service';

const createPostSchema = z.object({
  uploads: z
    .array(
      z.object({
        uploadId: z.string().min(1),
        key: z.string().min(1),
        kind: z.enum(['image', 'video']),
        durationMs: z.number().int().positive().optional(),
      }),
    )
    .min(1)
    .max(10),
  // FR-006: at least one interest, enforced by the schema and again in the service.
  interestIds: z.array(z.string().min(1)).min(1),
  caption: z.string().max(2000).optional(),
  visibility: visibilitySchema.default('public'),
  keepLocationMetadata: z.boolean().default(false),
});

@Controller('posts')
export class PostController {
  constructor(
    @Inject(PostService) private readonly posts: PostService,
    @Inject(PostQueryService) private readonly queries: PostQueryService,
  ) {}

  /** FR-006, FR-007, FR-013. */
  @Post()
  @RateLimit({ capacity: 10, refillPerSecond: 0.2 })
  async create(@Req() req: AppRequest, @Body() body: unknown) {
    const input = zodBody(createPostSchema, body);
    const post = await this.posts.create({
      authorId: req.viewer!.userId,
      uploadIds: input.uploads,
      interestIds: input.interestIds,
      ...(input.caption ? { caption: input.caption } : {}),
      visibility: input.visibility,
      keepLocationMetadata: input.keepLocationMetadata,
    });
    return post;
  }

  /**
   * FR-041, FR-042. This is also the share-link target.
   *
   * The 403/404 split matters and is not cosmetic: the client shows
   * "no longer available" vs "not available to you", and a block reports as 404
   * so that a 403 cannot confirm the post exists and disclose the block.
   */
  @Public()
  @Get(':postId')
  async getOne(@Req() req: AppRequest, @Param('postId') postId: string) {
    const result = await this.queries.getById(req.viewer ?? null, postId);
    // getById returns the post when visible, or the Decision explaining why not.
    // Discriminate on `post`, which only the success branch carries - narrowing
    // on `visible` leaves the success branch un-narrowed for the return below.
    if (!('post' in result)) {
      throw result.reason === 'gone'
        ? new DomainError(HttpStatus.NOT_FOUND, 'No longer available')
        : new DomainError(HttpStatus.FORBIDDEN, 'Not available to you');
    }
    return { ...result.post, media: result.media };
  }
}
