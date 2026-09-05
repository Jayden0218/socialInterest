import type { Comment } from '@sih/shared';
import type { DataClient } from './client';

export interface CommentPage {
  items: Comment[];
  nextCursor?: string;
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
