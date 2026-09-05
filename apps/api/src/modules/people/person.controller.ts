import { Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Put, Query, Req } from '@nestjs/common';
import { DomainError } from '../../common/errors/problem.filter';
import type { AppRequest } from '../../common/http/request';
import { Public } from '../../common/auth/auth.guard';
import { PersonRepository } from '../../persistence/person.repository';
import { PersonFollowRepository } from '../../persistence/person-follow.repository';
import { PostRepository } from '../../persistence/post.repository';
import { PostQueryService } from '../posts/post-query.service';
import { CATALOGUE_SEARCH, type CatalogueSearch } from '../interests/catalogue.cache';
import { PersonFollowService } from './person-follow.service';

@Controller('people')
export class PersonController {
  constructor(
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(PersonFollowRepository) private readonly follows: PersonFollowRepository,
    @Inject(PersonFollowService) private readonly followService: PersonFollowService,
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(PostQueryService) private readonly queries: PostQueryService,
    @Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch,
  ) {}

  /** FR-038: profile with counts and the interests this person posts to most. */
  @Public()
  @Get(':handle')
  async profile(@Req() req: AppRequest, @Param('handle') handle: string) {
    const person = await this.people.findByHandle(handle);
    if (!person || person.status !== 'active') {
      throw new DomainError(HttpStatus.NOT_FOUND, 'No such person');
    }

    // "Interests they post to most" is derived from their recent posts rather
    // than stored, so it cannot drift from what they actually publish.
    const recent = await this.posts.listByAuthor(person.userId, { limit: 50 });
    const tally = new Map<string, number>();
    for (const post of recent.items) {
      for (const id of post.interestIds) tally.set(id, (tally.get(id) ?? 0) + 1);
    }
    const topInterests = [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => this.catalogue.byId(id))
      .filter((i): i is NonNullable<typeof i> => i !== undefined)
      .map((i) => ({ interestId: i.interestId, name: i.name, slug: i.slug, level: i.level }));

    return {
      userId: person.userId,
      handle: person.handle,
      displayName: person.displayName,
      bio: person.bio ?? null,
      followerCount: person.followerCount,
      followingCount: person.followingCount,
      topInterests,
      viewerIsFollowing: req.viewer
        ? await this.follows.isFollowing(req.viewer.userId, person.userId)
        : false,
    };
  }

  /** FR-038. Through PostQueryService, so through VisibilityFilter. */
  @Public()
  @Get(':handle/posts')
  async posts_(
    @Req() req: AppRequest,
    @Param('handle') handle: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const person = await this.people.findByHandle(handle);
    if (!person) throw new DomainError(HttpStatus.NOT_FOUND, 'No such person');
    const page = await this.queries.listByAuthor(req.viewer ?? null, person.userId, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit))) : 20,
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

  /** FR-037. Idempotent. */
  @Put(':handle/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  async follow(@Req() req: AppRequest, @Param('handle') handle: string): Promise<void> {
    await this.followService.follow(req.viewer!.userId, handle);
  }

  @Delete(':handle/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unfollow(@Req() req: AppRequest, @Param('handle') handle: string): Promise<void> {
    await this.followService.unfollow(req.viewer!.userId, handle);
  }
}
