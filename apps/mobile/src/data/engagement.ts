import type { Comment } from '@sih/shared';
import type { DataClient } from './client';

export interface CommentPage {
  items: Comment[];
  /**
   * THE CONTRACT'S SHAPE, and it was WRONG here until 007.
   *
   * Every list endpoint answers `{ items, page: { nextCursor, ... } }`. This
   * declared `nextCursor` at the TOP LEVEL, so `usePaged` read `undefined`,
   * concluded the list was exhausted, and the app COULD NEVER LOAD A SECOND
   * PAGE — of the feed, an interest space, a profile, comments or
   * notifications. Since the first page always arrived, every screen looked
   * correct.
   *
   * Nothing caught it because every mobile test stubs this type, so the stubs
   * were wrong in exactly the same way the code was: they agreed with each
   * other and neither agreed with the server. Only a request could find it, and
   * `apps/e2e` now makes one that asks for page two.
   */
  page: { nextCursor: string | null; emptyStateHint?: string | null };
}

/** Reactions and comments (002/T023). */
export class EngagementData {
  constructor(private readonly client: DataClient) {}

  /** At most one reaction per person per post - the key structure enforces it (FR-039). */
  react(postId: string): Promise<void> {
    return this.client.call<void>('putPostsByPostIdReaction', { params: { postId } });
  }

  unreact(postId: string): Promise<void> {
    return this.client.call<void>('deletePostsByPostIdReaction', { params: { postId } });
  }

  comments(postId: string, opts: { limit?: number; cursor?: string } = {}): Promise<CommentPage> {
    return this.client.call<CommentPage>('getPostsByPostIdComments', {
      params: { postId },
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }

  comment(postId: string, body: string): Promise<Comment> {
    return this.client.call<Comment>('postPostsByPostIdComments', { params: { postId }, body: { body } });
  }
}
