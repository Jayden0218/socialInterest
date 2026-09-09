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
  /**
   * 008/FR-027. WHEN it was edited, which IS "marked as edited".
   *
   * Not a boolean beside a timestamp: two fields for one fact is how they come
   * to disagree, and this codebase has the pattern already — `anonymisedAt`
   * below, and 005's `editedAt` on a message.
   */
  editedAt?: string | null;
  anonymisedAt?: string | null;
  /**
   * 008/FR-023. The comment this one answers, or null for a top-level one.
   *
   * THE SORT KEY DOES NOT CHANGE. `A15` lists a post's comments with one Query
   * on `COMMENT#<createdAt>#<id>`, and encoding a thread into that key would
   * cost the single-Query listing the whole design rests on. Grouping is done
   * on the response (`groupWithParents`), which is where a DISPLAY rule belongs.
   */
  parentCommentId?: string | null;
  /**
   * 008/FR-026. Set when a moderator removes this comment.
   *
   * Removal WITHHOLDS the body and leaves the row, so the thread keeps its
   * shape and the replies keep their parent — 005/FR-024's rule for a
   * conversation name and a message, in a third place.
   */
  moderationState?: 'removed' | null;
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

  /** 008/FR-027. The body changes; `editedAt` records that it did. */
  async edit(
    ref: { postId: string; commentId: string; createdAt: string },
    body: string,
  ): Promise<void> {
    await this.updateItem(keys.comment(ref.postId, ref.createdAt, ref.commentId), {
      body,
      editedAt: new Date().toISOString(),
    });
  }

  /** Every comment on a post, for the reply-parent rule and for moderation. */
  async findById(postId: string, commentId: string): Promise<CommentItem | null> {
    const page = await this.query<CommentItem>(`POST#${postId}`, {
      skPrefix: SK_PREFIX.comment,
      ascending: true,
      limit: 200,
      cursor: null,
    });
    return page.items.find((c) => c.commentId === commentId) ?? null;
  }

  /**
   * 008/FR-026. Withhold the body; keep the row.
   *
   * A read-modify-write, like `anonymise` above and for the same reason: the
   * item's key carries `createdAt`, so an update needs the row it is updating.
   */
  async setModerationState(
    ref: { postId: string; commentId: string; createdAt: string },
    state: 'removed',
  ): Promise<void> {
    const key = keys.comment(ref.postId, ref.createdAt, ref.commentId);
    const existing = await this.getItem<CommentItem>(key);
    if (!existing) return;
    await this.putItem({ ...key, type: 'Comment', ...existing, moderationState: state });
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
