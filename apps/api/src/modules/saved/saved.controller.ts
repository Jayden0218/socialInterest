import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import type { AppRequest } from '../../common/http/request';
import { zodBody } from '../../common/http/validation';
import { SavedService } from './saved.service';
import { CollectionService } from './collection.service';

/**
 * A collection NAME is user-generated content (Constitution IV), so it is
 * length-bounded here and reportable and moderatable like any other. 60 matches
 * the data model.
 */
const collectionSchema = z.object({ name: z.string().trim().min(1).max(60) });

@Controller()
export class SavedController {
  constructor(
    @Inject(SavedService) private readonly saved: SavedService,
    @Inject(CollectionService) private readonly collections: CollectionService,
  ) {}

  /** FR-037. Refused for a post the caller cannot currently see. */
  @Put('posts/:postId/save')
  @HttpCode(HttpStatus.NO_CONTENT)
  async save(@Req() req: AppRequest, @Param('postId') postId: string): Promise<void> {
    await this.saved.save(req.viewer!.userId, postId);
  }

  @Delete('posts/:postId/save')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsave(@Req() req: AppRequest, @Param('postId') postId: string): Promise<void> {
    await this.saved.unsave(req.viewer!.userId, postId);
  }

  /**
   * FR-038, FR-039. SURFACE 9.
   *
   * Private BY KEY - saved rows live under the owner's own partition and no
   * index projects them, so there is no query anyone else can write that
   * reaches them. There is deliberately no endpoint that takes a person's
   * handle: an endpoint that could is one an authorisation bug can expose.
   */
  @Get('me/saved')
  async list(
    @Req() req: AppRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.saved.list(req.viewer!.userId, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit) || 20)) : 20,
      cursor: cursor ?? null,
    });
  }

  /**
   * 008/US15, FR-049 to FR-051 — COLLECTIONS.
   *
   * On `/me` for the reason the saved list is: there is deliberately no endpoint
   * that takes a person's handle, because an endpoint that could is one an
   * authorisation bug can expose. FR-050 is then a property of the route AND of
   * the key, not of a comparison somebody has to remember.
   */
  @Get('me/collections')
  async listCollections(
    @Req() req: AppRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const page = await this.collections.list(req.viewer!.userId, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit) || 50)) : 50,
      cursor: cursor ?? null,
    });
    return {
      items: page.items,
      page: {
        nextCursor: page.nextCursor,
        emptyStateHint: page.items.length === 0 ? 'no_collections' : null,
      },
    };
  }

  @Post('me/collections')
  @HttpCode(HttpStatus.CREATED)
  async createCollection(@Req() req: AppRequest, @Body() body: unknown) {
    return this.collections.create(req.viewer!.userId, zodBody(collectionSchema, body).name);
  }

  @Patch('me/collections/:collectionId')
  async renameCollection(
    @Req() req: AppRequest,
    @Param('collectionId') collectionId: string,
    @Body() body: unknown,
  ) {
    return this.collections.rename(
      req.viewer!.userId,
      collectionId,
      zodBody(collectionSchema, body).name,
    );
  }

  /** Deleting a collection does NOT unsave its posts (FR-051's converse). */
  @Delete('me/collections/:collectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCollection(
    @Req() req: AppRequest,
    @Param('collectionId') collectionId: string,
  ): Promise<void> {
    await this.collections.remove(req.viewer!.userId, collectionId);
  }

  /** SURFACE 16. Through the boundary, like every other post list. */
  @Get('me/collections/:collectionId/posts')
  async collectionPosts(
    @Req() req: AppRequest,
    @Param('collectionId') collectionId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const page = await this.collections.listPosts(req.viewer!.userId, collectionId, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit) || 20)) : 20,
      cursor: cursor ?? null,
    });
    return {
      items: page.items,
      page: {
        nextCursor: page.nextCursor,
        emptyStateHint: page.items.length === 0 ? 'no_posts_yet' : null,
      },
    };
  }

  /**
   * FR-049, FR-051. ADDITIVE: the membership row and the save are written in one
   * transaction, so a collection add can never take a post out of the saved
   * list. Idempotent, so a second tap is not a second row.
   */
  @Put('me/collections/:collectionId/posts/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async addToCollection(
    @Req() req: AppRequest,
    @Param('collectionId') collectionId: string,
    @Param('postId') postId: string,
  ): Promise<void> {
    await this.collections.addPost(req.viewer!.userId, collectionId, postId);
  }

  @Delete('me/collections/:collectionId/posts/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromCollection(
    @Req() req: AppRequest,
    @Param('collectionId') collectionId: string,
    @Param('postId') postId: string,
  ): Promise<void> {
    await this.collections.removePost(req.viewer!.userId, collectionId, postId);
  }
}
