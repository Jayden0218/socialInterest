import { Injectable } from '@nestjs/common';
import type { ProcessingState, Visibility } from '@sih/shared';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';

/**
 * Structurally identical to PostInterestIndexItem, deliberately (research R9).
 *
 * That is what makes a place page ONE MORE ROW in the visibility matrix rather
 * than a new class of test: the candidates it produces have the same shape the
 * filter already consumes, so nothing new decides anything.
 *
 * At most ONE per post - a post has at most one place (FR-015) - unlike the
 * interest index, which writes one per interest in the expanded set.
 */
export interface PostPlaceIndexItem {
  postId: string;
  authorId: string;
  placeId: string;
  visibility: Visibility;
  processingState: ProcessingState;
  createdAt: string;
}

@Injectable()
export class PostPlaceIndexRepository extends BaseRepository {
  /** A28 - recent posts attached to a place, newest first. */
  async listByPlace(
    placeId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<PostPlaceIndexItem>> {
    return this.query<PostPlaceIndexItem>(`PLACE#${placeId}`, {
      skPrefix: SK_PREFIX.post,
      limit: opts.limit ?? 20,
      cursor: opts.cursor ?? null,
    });
  }

  /**
   * The item, for inclusion in the post's OWN transaction.
   *
   * Deliberately not a write method: writing it separately would let a post
   * exist without its place row, or a visibility change land on one and not the
   * other. The place index is part of the post write or it is a bug waiting.
   */
  buildPut(item: PostPlaceIndexItem): Record<string, unknown> {
    return {
      ...keys.postPlaceIndex(item.placeId, item.createdAt, item.postId),
      type: 'PostPlaceIndex',
      ...item,
    };
  }

  buildDelete(placeId: string, createdAt: string, postId: string): Record<string, string> {
    return keys.postPlaceIndex(placeId, createdAt, postId);
  }

  /** FR-020: a merge carries posts across without orphaning them. */
  async movePlace(fromPlaceId: string, toPlaceId: string): Promise<number> {
    let moved = 0;
    let cursor: string | null = null;
    do {
      const page: Page<PostPlaceIndexItem> = await this.listByPlace(fromPlaceId, { limit: 100, cursor });
      for (const item of page.items) {
        await this.putItem(this.buildPut({ ...item, placeId: toPlaceId }));
        await this.deleteItem(keys.postPlaceIndex(fromPlaceId, item.createdAt, item.postId));
        moved++;
      }
      cursor = page.nextCursor;
    } while (cursor);
    return moved;
  }
}
