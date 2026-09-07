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
import { Public } from '../../common/auth/auth.guard';
import { OperatorGuard } from '../../common/auth/operator.guard';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import { zodBody } from '../../common/http/validation';
import { DomainError } from '../../common/errors/problem.filter';
import { PlaceService } from './place.service';
import { PlacePostsService } from './place-posts.service';
import { PlaceRepository } from '../../persistence/place.repository';

const categorySchema = z.enum(['restaurant', 'cafe', 'bar', 'shop', 'venue', 'outdoor', 'other']);

const createSchema = z.object({
  name: z.string().min(1).max(120),
  category: categorySchema,
  locality: z.string().min(1).max(120),
  address: z.string().max(240).optional(),
});

const patchSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    category: categorySchema.optional(),
    status: z.enum(['active', 'merged', 'retired']).optional(),
    mergedIntoPlaceId: z.string().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to change' });

@Controller('places')
export class PlaceController {
  constructor(
    @Inject(PlaceService) private readonly places: PlaceService,
    @Inject(PlacePostsService) private readonly placePosts: PlacePostsService,
    @Inject(PlaceRepository) private readonly repo: PlaceRepository,
  ) {}

  /** FR-014, FR-022. Readable signed out, like interest search. */
  @Public()
  @Get()
  async search(
    @Query('q') q?: string,
    @Query('locality') locality?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
  ) {
    const results = await this.places.search(q ?? '', {
      ...(locality ? { locality } : {}),
      ...(category ? { category: category as never } : {}),
      limit: limit ? Math.min(25, Math.max(1, Number(limit) || 10)) : 10,
    });
    return { items: results.map((p) => this.places.toResponse(p, false)) };
  }

  /** FR-013. Rate-limited like sub-interest creation - both are catalogue writes. */
  @Post()
  @RateLimit({ capacity: 5, refillPerSecond: 0.05 })
  async create(@Req() req: AppRequest, @Body() body: unknown) {
    const input = zodBody(createSchema, body);
    const place = await this.places.create(req.viewer!.userId, input);
    return this.places.toResponse(place, false);
  }

  @Public()
  @Get(':placeId')
  async get(@Req() req: AppRequest, @Param('placeId') placeId: string) {
    const place = await this.places.get(placeId, req.viewer?.userId ?? null);
    return this.places.toResponse(place, place.viewerIsFollowing);
  }

  /** FR-016, FR-017. Surface 8. Anonymous callers see public posts only. */
  @Public()
  @Get(':placeId/posts')
  async posts(
    @Req() req: AppRequest,
    @Param('placeId') placeId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const place = await this.repo.find(placeId);
    if (!place) throw new DomainError(HttpStatus.NOT_FOUND, 'No such place');
    return this.placePosts.list(req.viewer ?? null, placeId, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit) || 20)) : 20,
      cursor: cursor ?? null,
    });
  }

  /**
   * FR-018. And FR-019, which is enforced by the FEED never reading this: a
   * followed place contributes candidates only through interests the viewer
   * already follows. SC-006 asserts the negative directly.
   */
  @Put(':placeId/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  async follow(@Req() req: AppRequest, @Param('placeId') placeId: string) {
    await this.places.follow(req.viewer!.userId, placeId);
  }

  @Delete(':placeId/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unfollow(@Req() req: AppRequest, @Param('placeId') placeId: string) {
    await this.places.unfollow(req.viewer!.userId, placeId);
  }

  /** FR-020. Operators only. A merge carries posts and followers across. */
  @Patch(':placeId')
  async administer(@Req() req: AppRequest, @Param('placeId') placeId: string, @Body() body: unknown) {
    if (!req.viewer?.isOperator) throw new DomainError(HttpStatus.FORBIDDEN, 'Operators only');
    const patch = zodBody(patchSchema, body);
    const place = await this.repo.find(placeId);
    if (!place) throw new DomainError(HttpStatus.NOT_FOUND, 'No such place');

    if (patch.name) await this.repo.rename(place, patch.name);
    if (patch.status === 'merged') {
      if (!patch.mergedIntoPlaceId) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'Validation failed',
          'A merge needs mergedIntoPlaceId, or the posts have nowhere to go.',
        );
      }
      await this.places.merge(placeId, patch.mergedIntoPlaceId);
    } else if (patch.status) {
      await this.repo.setStatus(placeId, patch.status);
    }

    const updated = await this.places.get(placeId, req.viewer.userId);
    return this.places.toResponse(updated, updated.viewerIsFollowing);
  }
}

void OperatorGuard;
