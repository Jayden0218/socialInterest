import type { Place, PlaceCategory, PlaceSummary } from '@sih/shared';
import type { DataClient } from './client';
import type { PostPage } from './people';

/**
 * Places (004/US2).
 *
 * A Place is to a Post what an Interest is, MINUS feed membership. Same
 * attachment, same index item, same visibility treatment, same moderation - and
 * deliberately not a feed source (research R3). FR-019 is where that "minus" is
 * enforced, and nothing in this module may be used to undo it.
 */
export class PlacesData {
  constructor(private readonly client: DataClient) {}

  /**
   * FR-014, FR-022. `locality` narrows the search and is what makes the dedupe
   * meaningful: two "Joe's" in different cities are two places.
   */
  search(
    q: string,
    opts: { locality?: string; category?: PlaceCategory; limit?: number } = {},
  ): Promise<{ items: PlaceSummary[] }> {
    return this.client.call<{ items: PlaceSummary[] }>('getPlaces', {
      query: { q, locality: opts.locality, category: opts.category, limit: opts.limit },
    });
  }

  /**
   * FR-013. A 409 carries the EXISTING place, so the caller attaches that one
   * rather than creating a duplicate - the dedupe is a response, not an error.
   */
  create(input: {
    name: string;
    category: PlaceCategory;
    locality: string;
    address?: string;
  }): Promise<Place> {
    return this.client.call<Place>('postPlaces', { body: input });
  }

  get(placeId: string): Promise<Place> {
    return this.client.call<Place>('getPlacesByPlaceId', { params: { placeId } });
  }

  /** FR-016, FR-017. Surface 8 of the visibility matrix. */
  posts(placeId: string, opts: { limit?: number; cursor?: string } = {}): Promise<PostPage> {
    return this.client.call<PostPage>('getPlacesByPlaceIdPosts', {
      params: { placeId },
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }

  /** FR-018. Following a place does NOT widen the home feed (FR-019). */
  follow(placeId: string): Promise<void> {
    return this.client.call<void>('putPlacesByPlaceIdFollow', { params: { placeId } });
  }

  unfollow(placeId: string): Promise<void> {
    return this.client.call<void>('deletePlacesByPlaceIdFollow', { params: { placeId } });
  }
}
