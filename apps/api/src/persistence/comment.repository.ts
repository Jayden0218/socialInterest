import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';

export interface CommentItem {
  commentId: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: string;
  deletedAt?: string | null;
  anonymisedAt?: string | null;
}

/** A15. Comments share the post's partition, so listing is one Query. */
@Injectable()
export class CommentRepository extends BaseRepository {
  async create(comment: CommentItem): Promise<void> {
    await this.putItem({
      ...keys.comment(comment.postId, comment.createdAt, comment.commentId),
      type: 'Comment',
      ...comment,
    });
  }

  /** FR-003: keep the thread readable, remove the association. */
  async anonymise(ref: { postId: string; commentId: string; createdAt: string }): Promise<void> {
    const key = keys.comment(ref.postId, ref.createdAt, ref.commentId);
    const existing = await this.getItem<CommentItem>(key);
    if (!existing) return;
    await this.putItem({
      ...key,
      type: 'Comment',
      ...existing,
      authorId: 'ANONYMISED',
      anonymisedAt: new Date().toISOString(),
    });
  }

  async list(
    postId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<CommentItem>> {
    return this.query<CommentItem>(`POST#${postId}`, {
      skPrefix: SK_PREFIX.comment,
      ascending: true,
      limit: opts.limit ?? 20,
      cursor: opts.cursor ?? null,
    });
  }
}
