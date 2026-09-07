import { Injectable } from '@nestjs/common';
import type { ProcessingState, Visibility } from '@sih/shared';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';

export interface SavedPostItem {
  userId: string;
  postId: string;
  authorId: string;
  visibility: Visibility;
  processingState: ProcessingState;
  savedAt: string;
  createdAt: string;
}

/**
 * PRIVATE BY KEY (FR-038).
 *
 * Saved rows live under the owner's own partition and no index projects them, so
 * there is no query anybody else can write that reaches them. That is a stronger
 * guarantee than a check in a service, because it does not depend on the check
 * being called.
 *
 * `visibility` and `processingState` are denormalised for the same reason the
 * interest index denormalises them - the filter runs on the Query result rather
 * than fetching each candidate. They can go stale, which is CORRECT here: a save
 * is a bookmark, not a copy, and FR-039 resolves against current state at read
 * time regardless of what this row says.
 */
@Injectable()
export class SavedPostRepository extends BaseRepository {
  async isSaved(userId: string, postId: string): Promise<boolean> {
    return (await this.getItem(keys.savedPostBy(userId, postId))) !== null;
  }

  async save(item: SavedPostItem): Promise<void> {
    await this.transact([
      {
        Put: {
          TableName: this.tableName,
          Item: { ...keys.savedPost(item.userId, item.savedAt, item.postId), type: 'SavedPost', ...item },
        },
      },
      {
        Put: {
          TableName: this.tableName,
          Item: {
            ...keys.savedPostBy(item.userId, item.postId),
            type: 'SavedPostBy',
            userId: item.userId,
            postId: item.postId,
            savedAt: item.savedAt,
          },
        },
      },
    ]);
  }

  async unsave(userId: string, postId: string): Promise<boolean> {
    const marker = await this.getItem<{ savedAt: string }>(keys.savedPostBy(userId, postId));
    if (!marker) return false;
    await this.transact([
      { Delete: { TableName: this.tableName, Key: keys.savedPost(userId, marker.savedAt, postId) } },
      { Delete: { TableName: this.tableName, Key: keys.savedPostBy(userId, postId) } },
    ]);
    return true;
  }

  /** A32 - most recently saved first. */
  async list(
    userId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<SavedPostItem>> {
    return this.query<SavedPostItem>(`USER#${userId}`, {
      skPrefix: SK_PREFIX.savedPost,
      limit: opts.limit ?? 20,
      cursor: opts.cursor ?? null,
    });
  }
}
