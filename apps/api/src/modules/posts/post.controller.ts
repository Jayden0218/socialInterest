import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { visibilitySchema } from '@sih/shared';
import { DomainError } from '../../common/errors/problem.filter';
import type { AppRequest } from '../../common/http/request';
import { zodBody } from '../../common/http/validation';
import { Public } from '../../common/auth/auth.guard';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import { PostService } from './post.service';
import { ReactionRepository } from '../../persistence/reaction.repository';
import { PostQueryService } from './post-query.service';

const updatePostSchema = z
  .object({
    caption: z.string().max(2000),
    interestIds: z.array(z.string().min(1)).min(1),
    visibility: visibilitySchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to change' });

const createPostSchema = z.object({
  // contracts/openapi.yaml PostCreate: ids only. The server reads key, kind and
  // duration from its own upload record - see PostService.create.
  uploadIds: z.array(z.string().min(1)).min(1).max(10),
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
    @Inject(ReactionRepository) private readonly reactions: ReactionRepository,
  ) {}

  /** FR-006, FR-007, FR-013. */
  @Post()
  @RateLimit({ capacity: 10, refillPerSecond: 0.2 })
  async create(@Req() req: AppRequest, @Body() body: unknown) {
    const input = zodBody(createPostSchema, body);
    const post = await this.posts.create({
      authorId: req.viewer!.userId,
      uploadIds: input.uploadIds,
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
    /**
     * The contract's Post carries viewerHasReacted, and only the react/unreact
     * endpoints ever returned it - so a client reading a post could not tell
     * whether this person had already reacted, and the control rendered
     * unreacted every time. One point read on the viewer's own reaction.
     *
     * Deliberately not populated on list surfaces: that would be a lookup per
     * item per page. The field is optional in the contract for that reason.
     */
    const viewerHasReacted =
      req.viewer === undefined || req.viewer === null
        ? false
        : await this.reactions.exists(postId, req.viewer.userId);
    return { ...result.post, media: result.media, viewerHasReacted };
  }

  /**
   * FR-011, FR-017. A visibility change takes effect on every surface
   * immediately, and outstanding share links resolve against the new value -
   * see post-update.transaction.ts for why that is one transaction.
   */
  @Patch(':postId')
  async update(@Req() req: AppRequest, @Param('postId') postId: string, @Body() body: unknown) {
    const patch = zodBody(updatePostSchema, body);
    return this.posts.update(postId, req.viewer!.userId, patch);
  }

  /** FR-012. */
  @Delete(':postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: AppRequest, @Param('postId') postId: string): Promise<void> {
    await this.posts.remove(postId, req.viewer!.userId);
  }
}
