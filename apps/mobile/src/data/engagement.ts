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

  /** 008/FR-023. `parentCommentId` makes it a reply; the server resolves it. */
  comment(postId: string, body: string, parentCommentId?: string | null): Promise<Comment> {
    return this.client.call<Comment>('postPostsByPostIdComments', {
      params: { postId },
      body: { body, ...(parentCommentId ? { parentCommentId } : {}) },
    });
  }

  /** 008/FR-027. The server refuses anyone but the author. */
  editComment(postId: string, commentId: string, body: string): Promise<Comment> {
    return this.client.call<Comment>('patchPostsByPostIdCommentsByCommentId', {
      params: { postId, commentId },
      body: { body },
    });
  }

  /** 008/FR-028. 204; the count moves with the row, in one transaction. */
  deleteComment(postId: string, commentId: string): Promise<void> {
    return this.client.call<void>('deletePostsByPostIdCommentsByCommentId', {
      params: { postId, commentId },
    });
  }
}
