import type { Post } from '@sih/shared';
import type { DataClient } from './client';
import type { PostPage } from './people';

/**
 * Saved posts (004/US5).
 *
 * A SAVE IS A BOOKMARK, NOT A COPY. There is deliberately no endpoint that
 * takes a person's handle - the list is reachable only as "mine", so there is
 * no route an authorisation bug could expose (FR-038).
 */
export class SavedData {
  constructor(private readonly client: DataClient) {}

  save(postId: string): Promise<void> {
    return this.client.call<void>('putPostsByPostIdSave', { params: { postId } });
  }

  unsave(postId: string): Promise<void> {
    return this.client.call<void>('deletePostsByPostIdSave', { params: { postId } });
  }

  /**
   * FR-039. A post the saver may no longer see is ABSENT, never stale - the
   * server resolves each one against its current visibility at read time.
   */
  list(opts: { limit?: number; cursor?: string } = {}): Promise<PostPage> {
    return this.client.call<PostPage>('getMeSaved', {
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }
}

export type SavedPost = Post;
