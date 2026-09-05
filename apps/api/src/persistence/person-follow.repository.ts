import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';

export interface PersonFollowItem {
  followerId: string;
  followeeId: string;
  followedAt: string;
}

/**
 * A10 - THE AUTHORITY FOR FR-015. "Can this viewer see a followers-only post?" is
 * the point read below, on the viewer's own partition, so it stays cheap on the
 * feed hot path.
 *
 * Built in Phase 2 rather than with US4, because the visibility filter depends on
 * it and the filter gates every story.
 *
 * NOTE: following an *interest* grants nothing here. That is the second easy
 * mistake named in contracts/visibility-matrix.md.
 */
@Injectable()
export class PersonFollowRepository extends BaseRepository {
  async isFollowing(followerId: string, followeeId: string): Promise<boolean> {
    const item = await this.getItem<PersonFollowItem>(keys.personFollow(followerId, followeeId));
    return item !== null;
  }

  async follow(followerId: string, followeeId: string): Promise<void> {
    await this.putItem({
      ...keys.personFollow(followerId, followeeId),
      ...keys.personFollowInverted(followeeId, followerId),
      type: 'PersonFollow',
      followerId,
      followeeId,
      followedAt: new Date().toISOString(),
    });
  }

  async unfollow(followerId: string, followeeId: string): Promise<void> {
    await this.deleteItem(keys.personFollow(followerId, followeeId));
  }

  /** A9 - who this person follows. */
  async listFollowing(
    followerId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<PersonFollowItem>> {
    return this.query<PersonFollowItem>(`USER#${followerId}`, {
      skPrefix: SK_PREFIX.personFollow,
      limit: opts.limit ?? 50,
      cursor: opts.cursor ?? null,
    });
  }

  /** A11 - who follows this person, via the inverted GSI. */
  async listFollowers(
    followeeId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<PersonFollowItem>> {
    return this.query<PersonFollowItem>(`USER#${followeeId}`, {
      indexName: 'gsi4',
      skPrefix: 'PFOLLOWER#',
      limit: opts.limit ?? 50,
      cursor: opts.cursor ?? null,
    });
  }
}
