import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { averageOf } from '../../ratings/aggregate';
import { ulid } from 'ulid';
import { DomainError } from '../../common/errors/problem.filter';
import {
  PlaceRepository,
  normaliseLocality,
  normalisePlaceName,
  slugifyPlace,
  type PlaceCategory,
  type PlaceItem,
} from '../../persistence/place.repository';
import { PlaceFollowRepository } from '../../persistence/place-follow.repository';
import { PostPlaceIndexRepository } from '../../persistence/post-place-index.repository';

@Injectable()
export class PlaceService {
  constructor(
    @Inject(PlaceRepository) private readonly places: PlaceRepository,
    @Inject(PlaceFollowRepository) private readonly follows: PlaceFollowRepository,
    @Inject(PostPlaceIndexRepository) private readonly index: PostPlaceIndexRepository,
  ) {}

  /**
   * FR-013, FR-014.
   *
   * A duplicate is a 409 that CARRIES THE EXISTING PLACE, so the client attaches
   * that one. The dedupe is a response, not an error - a bare rejection sends
   * the person back to a form with no way to do the right thing.
   */
  async create(
    createdBy: string,
    input: { name: string; category: PlaceCategory; locality: string; address?: string },
  ): Promise<PlaceItem> {
    const locality = normaliseLocality(input.locality);
    const slug = slugifyPlace(input.name);
    if (!slug || !locality) {
      throw new DomainError(HttpStatus.UNPROCESSABLE_ENTITY, 'Validation failed', 'A place needs a name and a locality');
    }

    const existing = await this.places.findBySlug(locality, slug);
    if (existing && existing.status === 'active') {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'That place already exists here',
        'Attach the existing place rather than creating a duplicate.',
        this.toResponse(existing, false),
      );
    }

    return this.places.create({
      placeId: ulid(),
      name: input.name.trim(),
      category: input.category,
      locality: input.locality.trim(),
      address: input.address?.trim() ?? null,
      createdBy,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * FR-014, FR-022. What a person sees WHILE TYPING.
   *
   * Normalised prefix and containment within the locality. The matching rule is
   * the same `normalisePlaceName` the slug uses, so what the search surfaces and
   * what the create refuses can never disagree - which they would if the search
   * used its own comparison.
   */
  async search(
    q: string,
    opts: { locality?: string; category?: PlaceCategory; limit?: number },
  ): Promise<PlaceItem[]> {
    const needle = normalisePlaceName(q);
    if (!needle || !opts.locality) return [];
    const page = await this.places.listByLocality(opts.locality, { limit: 200 });
    return page.items
      .filter((p) => p.status === 'active')
      .filter((p) => !opts.category || p.category === opts.category)
      .filter((p) => p.nameNormalised === needle || p.nameNormalised.startsWith(`${needle} `))
      .slice(0, opts.limit ?? 10);
  }

  async get(placeId: string, viewerId: string | null): Promise<PlaceItem & { viewerIsFollowing: boolean }> {
    const place = await this.places.find(placeId);
    if (!place) throw new DomainError(HttpStatus.NOT_FOUND, 'No such place');
    const viewerIsFollowing = viewerId ? await this.follows.isFollowing(viewerId, placeId) : false;
    return { ...place, viewerIsFollowing };
  }

  /** FR-018. Following a place does NOT widen the feed - see FR-019 and the feed service. */
  async follow(viewerId: string, placeId: string): Promise<void> {
    const place = await this.places.find(placeId);
    if (!place || place.status !== 'active') throw new DomainError(HttpStatus.NOT_FOUND, 'No such place');
    if (await this.follows.follow(viewerId, placeId, new Date().toISOString())) {
      await this.places.incrementFollowerCount(placeId, 1);
    }
  }

  async unfollow(viewerId: string, placeId: string): Promise<void> {
    if (await this.follows.unfollow(viewerId, placeId)) {
      await this.places.incrementFollowerCount(placeId, -1);
    }
  }

  /** FR-020. Posts and followers move; nothing is orphaned. */
  async merge(fromPlaceId: string, intoPlaceId: string): Promise<{ postsMoved: number; followersMoved: number }> {
    const [from, into] = await Promise.all([this.places.find(fromPlaceId), this.places.find(intoPlaceId)]);
    if (!from || !into) throw new DomainError(HttpStatus.NOT_FOUND, 'No such place');

    const postsMoved = await this.index.movePlace(fromPlaceId, intoPlaceId);

    let followersMoved = 0;
    let cursor: string | null = null;
    do {
      const page = await this.follows.listFollowers(fromPlaceId, { limit: 100, cursor });
      for (const f of page.items) {
        if (await this.follows.follow(f.userId, intoPlaceId, f.followedAt)) followersMoved++;
        await this.follows.unfollow(f.userId, fromPlaceId);
      }
      cursor = page.nextCursor;
    } while (cursor);

    await this.places.setStatus(fromPlaceId, 'merged', intoPlaceId);
    await this.places.incrementFollowerCount(intoPlaceId, followersMoved);
    await this.places.incrementPostCount(intoPlaceId, postsMoved);
    return { postsMoved, followersMoved };
  }

  toResponse(
    place: PlaceItem,
    viewerIsFollowing: boolean,
    viewerRating: number | null = null,
  ): Record<string, unknown> {
    return {
      placeId: place.placeId,
      name: place.name,
      category: place.category,
      locality: place.locality,
      address: place.address,
      status: place.status,
      mergedIntoPlaceId: place.mergedIntoPlaceId,
      followerCount: place.followerCount,
      postCount: place.postCount,
      viewerIsFollowing,
      /**
       * 005/FR-004, FR-005. Computed from the counters already on the item this
       * method was handed, so the summary costs no extra read.
       *
       * `average` is NULL when nothing has been rated, never 0 - `averageOf`
       * enforces that, and it is also what makes a place written before 005 read
       * as unrated rather than as NaN. NaN serialises to `null` in JSON, so that
       * bug would have looked exactly like the correct answer until a place had
       * ratings.
       */
      ratingSummary: { average: averageOf(place), count: Math.max(0, place.ratingCount ?? 0) },
      viewerRating,
    };
  }
}
