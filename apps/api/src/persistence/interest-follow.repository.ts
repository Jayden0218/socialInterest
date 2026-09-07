import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';

export interface InterestFollowItem {
  userId: string;
  interestId: string;
  followedAt: string;
}

/** Access patterns A6 (what I follow), A7 (do I follow this), A8 (followers of). */
@Injectable()
export class InterestFollowRepository extends BaseRepository {
  async isFollowing(userId: string, interestId: string): Promise<boolean> {
    return (await this.getItem<InterestFollowItem>(keys.interestFollow(userId, interestId))) !== null;
  }

  /** A6. Returns every followed interest - the cap keeps this bounded. */
  async listFollowed(userId: string, limit = 250): Promise<InterestFollowItem[]> {
    const out: InterestFollowItem[] = [];
    let cursor: string | null = null;
    do {
      const page: Page<InterestFollowItem> = await this.query<InterestFollowItem>(`USER#${userId}`, {
        skPrefix: SK_PREFIX.interestFollow,
        limit: 100,
        cursor,
      });
      out.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor && out.length < limit);
    return out;
  }

  async follow(userId: string, interestId: string): Promise<void> {
    await this.putItem({
      ...keys.interestFollow(userId, interestId),
      ...keys.interestFollowInverted(interestId, userId),
      type: 'InterestFollow',
      userId,
      interestId,
      followedAt: new Date().toISOString(),
    });
  }

  async unfollow(userId: string, interestId: string): Promise<void> {
    await this.deleteItem(keys.interestFollow(userId, interestId));
  }

  /** A8 - followers of an interest, via the inverted GSI. */
  async listFollowers(
    interestId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<InterestFollowItem>> {
    return this.query<InterestFollowItem>(`INTEREST#${interestId}`, {
      indexName: 'gsi4',
      skPrefix: 'IFOLLOWER#',
      limit: opts.limit ?? 50,
      cursor: opts.cursor ?? null,
    });
  }
}
