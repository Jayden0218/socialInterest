import { Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Put, Query, Req } from '@nestjs/common';
import { DomainError } from '../../common/errors/problem.filter';
import type { AppRequest } from '../../common/http/request';
import { Public } from '../../common/auth/auth.guard';
import { MuteRepository } from '../../persistence/mute.repository';
import { PersonRepository } from '../../persistence/person.repository';
import { PersonFollowRepository } from '../../persistence/person-follow.repository';
import { PostRepository } from '../../persistence/post.repository';
import { PostQueryService } from '../posts/post-query.service';
import { CATALOGUE_SEARCH, type CatalogueSearch } from '../interests/catalogue.cache';
import { PersonSearchService } from './person-search.service';
import { ProfileProjection } from './profile.projection';
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
    @Inject(PersonSearchService) private readonly searchService: PersonSearchService,
    @Inject(ProfileProjection) private readonly profiles: ProfileProjection,
    @Inject(MuteRepository) private readonly mutes: MuteRepository,
  ) {}

  /** FR-038: profile with counts and the interests this person posts to most. */
  /**
   * 004/FR-034 to FR-036. Signed-in only: an anonymous people directory is a
   * scraping surface, and nothing in the product needs one.
   */
  @Get()
  async search(@Req() req: AppRequest, @Query('q') q?: string, @Query('limit') limit?: string) {
    const people = await this.searchService.search(
      req.viewer!.userId,
      q ?? '',
      limit ? Math.min(25, Math.max(1, Number(limit) || 10)) : 10,
    );
    /**
     * 008/US5. THE RAW STORAGE KEY IS GONE.
     *
     * This line was `avatarUrl: p.avatarKey` — the object-store key, emitted as
     * a URL, on the ONE surface of seven that carried the field at all. Against
     * a private bucket a client gets 403, which is 006/R4b's defect reproduced
     * in a second place. The projection presigns it, after the boundary.
     */
    return { items: await Promise.all(people.map((p) => this.profiles.toPublicProfile(p))) };
  }

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
      ...(await this.profiles.toPublicProfile(person)),
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

  /**
   * 008/FR-039, FR-040 — MUTE. Idempotent, and silent.
   *
   * 204 with no body, and NOTHING anywhere else in the API says a mute exists:
   * no field on a profile, no count, no ordering. FR-040 makes that a
   * requirement rather than a nicety, and the row's key (A50 — the muter's
   * partition, no inverted index) is what makes it true structurally rather
   * than by everyone remembering.
   *
   * The follow is untouched on purpose. Muting is not a quieter unfollow: the
   * relationship survives, the conversation survives, and the person's profile
   * still shows their posts to the muter who goes and looks.
   */
  @Put(':handle/mute')
  @HttpCode(HttpStatus.NO_CONTENT)
  async mute(@Req() req: AppRequest, @Param('handle') handle: string): Promise<void> {
    const person = await this.people.findByHandle(handle);
    if (!person) throw new DomainError(HttpStatus.NOT_FOUND, 'No such person');
    if (person.userId === req.viewer!.userId) {
      throw new DomainError(HttpStatus.UNPROCESSABLE_ENTITY, 'Validation failed', 'You cannot mute yourself');
    }
    await this.mutes.mute(req.viewer!.userId, person.userId);
  }

  @Delete(':handle/mute')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unmute(@Req() req: AppRequest, @Param('handle') handle: string): Promise<void> {
    const person = await this.people.findByHandle(handle);
    if (!person) throw new DomainError(HttpStatus.NOT_FOUND, 'No such person');
    await this.mutes.unmute(req.viewer!.userId, person.userId);
  }
}
