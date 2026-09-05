import { Injectable } from '@nestjs/common';
import type { ProcessingState, Visibility } from '@sih/shared';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';

export interface PostItem {
  postId: string;
  authorId: string;
  caption?: string;
  interestIds: string[];
  visibility: Visibility;
  processingState: ProcessingState;
  mediaKind: 'images' | 'video';
  reactionCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  removedByModeration?: boolean;
}

export interface MediaItemRecord {
  postId: string;
  ordinal: number;
  kind: 'image' | 'video';
  originalKey?: string;
  renditions: Record<string, string>;
  width?: number;
  height?: number;
  durationMs?: number;
  posterKey?: string;
  /** FR-010: written only by the server-side processor; gates `ready`. */
  exifStripped: boolean;
  processingState: ProcessingState;
}

/** A3: the post and all its media items live in one partition, so this is one Query. */
@Injectable()
export class PostRepository extends BaseRepository {
  async findById(postId: string): Promise<PostItem | null> {
    return this.getItem<PostItem>(keys.post(postId));
  }

  /** A3 - post plus media in a single round trip. */
  async findWithMedia(
    postId: string,
  ): Promise<{ post: PostItem; media: MediaItemRecord[] } | null> {
    const page = await this.query<Record<string, unknown>>(`POST#${postId}`, {
      ascending: true,
      limit: 20,
    });
    const post = page.items.find((i) => i['sk'] === '#META') as PostItem | undefined;
    if (!post) return null;
    const media = page.items
      .filter((i) => String(i['sk']).startsWith(SK_PREFIX.media))
      .sort((a, b) => String(a['sk']).localeCompare(String(b['sk']))) as unknown as MediaItemRecord[];
    return { post, media };
  }

  /** A5 - a person's posts, newest first, via GSI2. */
  async listByAuthor(
    authorId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<PostItem>> {
    return this.query<PostItem>(`USER#${authorId}`, {
      indexName: 'gsi2',
      skPrefix: 'TS#',
      limit: opts.limit ?? 20,
      cursor: opts.cursor ?? null,
    });
  }

  async listMedia(postId: string): Promise<MediaItemRecord[]> {
    const page = await this.query<MediaItemRecord>(`POST#${postId}`, {
      skPrefix: SK_PREFIX.media,
      ascending: true,
      limit: 20,
    });
    return page.items;
  }

  async updateMediaState(
    postId: string,
    ordinal: number,
    patch: Partial<MediaItemRecord>,
  ): Promise<void> {
    const existing = await this.getItem<MediaItemRecord>(keys.mediaItem(postId, ordinal));
    if (!existing) throw new Error(`media item ${postId}#${ordinal} not found`);
    await this.putItem({
      ...keys.mediaItem(postId, ordinal),
      type: 'MediaItem',
      ...existing,
      ...patch,
    });
  }

  /** FR-012 soft delete. Read paths treat a deleted post as gone for everyone. */
  async setDeleted(postId: string, deletedAt: string): Promise<void> {
    const post = await this.findById(postId);
    if (!post) return;
    await this.putItem({
      ...keys.post(postId),
      ...keys.postByAuthor(post.authorId, post.createdAt, postId),
      type: 'Post',
      ...post,
      deletedAt,
      updatedAt: deletedAt,
    });
  }

  async incrementCommentCount(postId: string, by: number): Promise<void> {
    await this.increment(keys.post(postId), 'commentCount', by);
  }

  async setProcessingState(postId: string, state: ProcessingState): Promise<void> {
    const post = await this.findById(postId);
    if (!post) throw new Error(`post ${postId} not found`);
    await this.putItem({
      ...keys.post(postId),
      ...keys.postByAuthor(post.authorId, post.createdAt, postId),
      type: 'Post',
      ...post,
      processingState: state,
      updatedAt: new Date().toISOString(),
    });
  }
}
