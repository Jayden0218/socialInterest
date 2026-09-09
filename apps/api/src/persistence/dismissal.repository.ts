import { Injectable } from '@nestjs/common';
import { BaseRepository } from './base.repository';
import { keys, SK_PREFIX } from './keys';

/**
 * 008/US12, FR-041 — A51. NOT THIS ONE, AGAIN.
 *
 * Private by key like the mute above, and for a second reason: a dismissal is a
 * negative signal about somebody's content, and an index that let an author
 * count dismissals would be a scoreboard of who disliked them.
 */
@Injectable()
export class DismissalRepository extends BaseRepository {
  async dismiss(viewerId: string, postId: string): Promise<void> {
    await this.putItem({
      ...keys.dismissal(viewerId, postId),
      type: 'Dismissal',
      viewerId,
      postId,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * The posts this viewer has dismissed.
   *
   * Bounded, and the bound is the honest limit of this design: a viewer who has
   * dismissed more than this many posts will see the oldest ones become
   * eligible again. Stated here rather than discovered — the alternative is an
   * unbounded read on the feed path.
   */
  async listDismissed(viewerId: string, limit = 500): Promise<Set<string>> {
    const page = await this.query<{ postId: string }>(`USER#${viewerId}`, {
      skPrefix: SK_PREFIX.dismissal,
      ascending: false,
      limit,
      cursor: null,
    });
    return new Set(page.items.map((d) => d.postId));
  }

  /** 007/FR-012. A signal reset clears these with everything else. */
  async clear(viewerId: string): Promise<void> {
    const ids = await this.listDismissed(viewerId, 1000);
    for (const postId of ids) {
      await this.deleteItem(keys.dismissal(viewerId, postId));
    }
  }
}
