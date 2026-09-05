import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type { Visibility } from '@sih/shared';
import { DomainError } from '../../common/errors/problem.filter';
import { MEDIA_LIMITS } from '../../config/media.limits';
import { CATALOGUE_SEARCH, type CatalogueSearch } from '../interests/catalogue.cache';
import { PostRepository, type MediaItemRecord, type PostItem } from '../../persistence/post.repository';
import { EVENT_BUS, type EventBus } from '../../ports';
import { PostTransaction } from './post.transaction';

export interface CreatePostInput {
  authorId: string;
  uploadIds: { uploadId: string; key: string; kind: 'image' | 'video'; durationMs?: number }[];
  interestIds: string[];
  caption?: string;
  visibility?: Visibility;
  keepLocationMetadata?: boolean;
}

@Injectable()
export class PostService {
  constructor(
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(PostTransaction) private readonly tx: PostTransaction,
    @Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  /**
   * FR-024: a post published to a sub-interest also appears in its parent's
   * space. Rather than querying the parent at read time, one index item is
   * written per interest in the expanded set - so both spaces are a single Query.
   */
  expandInterests(interestIds: string[]): string[] {
    const expanded = new Set<string>();
    for (const id of interestIds) {
      const interest = this.catalogue.byId(id);
      if (!interest) {
        throw new DomainError(HttpStatus.UNPROCESSABLE_ENTITY, 'Unknown interest', `No interest ${id}`);
      }
      if (interest.state !== 'active') {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'Interest unavailable',
          `Interest ${interest.name} is ${interest.state}`,
        );
      }
      expanded.add(id);
      if (interest.parentId) expanded.add(interest.parentId);
    }
    return [...expanded];
  }

  async create(input: CreatePostInput): Promise<PostItem> {
    // FR-006: publishing without an interest is refused. Checked before any
    // item is created, so a rejected post leaves nothing behind.
    if (input.interestIds.length === 0) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Validation failed',
        'A post must be assigned to at least one interest',
      );
    }
    if (input.uploadIds.length === 0) {
      throw new DomainError(HttpStatus.UNPROCESSABLE_ENTITY, 'Validation failed', 'A post needs media');
    }

    const kinds = new Set(input.uploadIds.map((u) => u.kind));
    if (kinds.size > 1) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Validation failed',
        'A post is either images or a single video, not both',
      );
    }
    const mediaKind = kinds.has('video') ? 'video' : 'images';
    if (mediaKind === 'video' && input.uploadIds.length !== 1) {
      throw new DomainError(HttpStatus.UNPROCESSABLE_ENTITY, 'Validation failed', 'One video per post');
    }
    if (mediaKind === 'images' && input.uploadIds.length > MEDIA_LIMITS.image.maxPerPost) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Validation failed',
        `At most ${MEDIA_LIMITS.image.maxPerPost} images per post`,
      );
    }

    const expandedInterestIds = this.expandInterests(input.interestIds);
    const now = new Date().toISOString();
    const postId = ulid();

    const post: PostItem = {
      postId,
      authorId: input.authorId,
      ...(input.caption ? { caption: input.caption } : {}),
      interestIds: input.interestIds,
      // FR-013: public unless the author chose otherwise.
      visibility: input.visibility ?? 'public',
      processingState: 'pending',
      mediaKind,
      reactionCount: 0,
      commentCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const media: MediaItemRecord[] = input.uploadIds.map((u, ordinal) => ({
      postId,
      ordinal,
      kind: u.kind,
      originalKey: u.key,
      renditions: {},
      ...(u.durationMs !== undefined ? { durationMs: u.durationMs } : {}),
      // FR-010: false until the server-side processor says otherwise. A media
      // item can never reach `ready` while this is false.
      exifStripped: false,
      processingState: 'pending',
    }));

    await this.tx.createPost({ post, media, expandedInterestIds });

    await this.events.publish({
      type: 'post.created',
      payload: { postId, authorId: input.authorId, mediaKind, keepLocationMetadata: input.keepLocationMetadata === true },
    });

    return post;
  }

  async findById(postId: string): Promise<PostItem | null> {
    return this.posts.findById(postId);
  }
}
