import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';

export interface PlaceFollowItem {
  userId: string;
  placeId: string;
  followedAt: string;
}

/**
 * WHAT THIS REPOSITORY IS NOT FOR.
 *
 * It is NOT read by the home feed's candidate assembly, and it must never be.
 * FR-019 is satisfied by the feed never asking this question: a post reaches a
 * viewer's feed through interests they follow, and a place-follow adds nothing.
 *
 * This note is here rather than only in the design doc because the item existing
 * is exactly what tempts a later change to consult it - "we already store who
 * follows this place, why not surface it" is Constitution I violated by
 * convenience, and SC-006 is the test that catches it.
 */
@Injectable()
export class PlaceFollowRepository extends BaseRepository {
  async isFollowing(userId: string, placeId: string): Promise<boolean> {
    return (await this.getItem<PlaceFollowItem>(keys.placeFollow(userId, placeId))) !== null;
  }

  /** Returns true if this created a new follow, false if it already existed. */
  async follow(userId: string, placeId: string, now: string): Promise<boolean> {
    if (await this.isFollowing(userId, placeId)) return false;
    await this.putItem({
      ...keys.placeFollow(userId, placeId),
      ...keys.placeFollowInverted(placeId, userId),
      type: 'PlaceFollow',
      userId,
      placeId,
      followedAt: now,
    });
    return true;
  }

  async unfollow(userId: string, placeId: string): Promise<boolean> {
    if (!(await this.isFollowing(userId, placeId))) return false;
    await this.deleteItem(keys.placeFollow(userId, placeId));
    return true;
  }

  /** A29 - the places a person follows. */
  async listFollowed(
    userId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<PlaceFollowItem>> {
    return this.query<PlaceFollowItem>(`USER#${userId}`, {
      skPrefix: SK_PREFIX.placeFollow,
      limit: opts.limit ?? 50,
      cursor: opts.cursor ?? null,
    });
  }

  /** A31 - followers of a place, on GSI4 (Inverted). For counts and merges. */
  async listFollowers(
    placeId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<PlaceFollowItem>> {
    return this.query<PlaceFollowItem>(`PLACE#${placeId}`, {
      indexName: 'gsi4',
      limit: opts.limit ?? 100,
      cursor: opts.cursor ?? null,
    });
  }
}
