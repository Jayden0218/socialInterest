import { Injectable } from '@nestjs/common';
import type { ProcessingState, Visibility } from '@sih/shared';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';

/**
 * The index item that makes A4 a single Query per interest.
 *
 * `visibility`, `processingState` and `authorId` are DENORMALISED onto it on
 * purpose: the visibility filter then runs on the Query result directly instead
 * of fetching every candidate post. The cost is that FR-017 must update the post
 * item and these index items together - which is why post writes are transactional.
 */
export interface PostInterestIndexItem {
  postId: string;
  authorId: string;
  interestId: string;
  visibility: Visibility;
  processingState: ProcessingState;
  createdAt: string;
}

@Injectable()
export class PostInterestIndexRepository extends BaseRepository {
  /**
   * FR-030: move every index item from one interest to another. Idempotent -
   * an item already at the target is simply rewritten, so a failed merge can be
   * re-run without double-counting.
   */
  async moveInterest(fromInterestId: string, toInterestId: string): Promise<number> {
    let moved = 0;
    let cursor: string | null = null;
    do {
      const page: Page<PostInterestIndexItem> = await this.listByInterest(fromInterestId, {
        limit: 100,
        cursor,
      });
      for (const item of page.items) {
        await this.putItem({
          ...keys.postInterestIndex(toInterestId, item.createdAt, item.postId),
          type: 'PostInterestIndex',
          ...item,
          interestId: toInterestId,
        });
        await this.deleteItem(keys.postInterestIndex(fromInterestId, item.createdAt, item.postId));
        moved++;
      }
      cursor = page.nextCursor;
    } while (cursor);
    return moved;
  }

  /** A4 - recent posts in one interest, newest first. */
  async listByInterest(
    interestId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<PostInterestIndexItem>> {
    return this.query<PostInterestIndexItem>(`INTEREST#${interestId}`, {
      skPrefix: SK_PREFIX.post,
      limit: opts.limit ?? 20,
      cursor: opts.cursor ?? null,
    });
  }
}
