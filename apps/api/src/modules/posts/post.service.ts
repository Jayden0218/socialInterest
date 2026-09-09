import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type { Visibility } from '@sih/shared';
import { PlaceRepository } from '../../persistence/place.repository';
import { PersonRepository } from '../../persistence/person.repository';
import { DomainError } from '../../common/errors/problem.filter';
import { resolveMentions } from '../engagement/mention';
import { MEDIA_LIMITS } from '../../config/media.limits';
import { CATALOGUE_SEARCH, type CatalogueSearch } from '../interests/catalogue.cache';
import { PostRepository, type MediaItemRecord, type PostItem } from '../../persistence/post.repository';
import { UploadRepository } from '../../persistence/upload.repository';
import { EVENT_BUS, type EventBus } from '../../ports';
import { PostTransaction } from './post.transaction';
import { PostUpdateTransaction, type PostUpdate } from './post-update.transaction';

export interface CreatePostInput {
  authorId: string;
  /**
   * Ids from POST /media/uploads, as the contract's PostCreate declares. The key
   * and kind are NOT accepted from the caller - they are read from the upload
   * record, which also proves the upload was issued to this author.
   */
  uploadIds: string[];
  interestIds: string[];
  caption?: string;
  visibility?: Visibility;
  keepLocationMetadata?: boolean;
  /** 004/FR-015. Validated against the catalogue before the post is written. */
  placeId?: string;
}

@Injectable()
export class PostService {
  constructor(
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(PostTransaction) private readonly tx: PostTransaction,
    @Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(PostUpdateTransaction) private readonly updates: PostUpdateTransaction,
    @Inject(UploadRepository) private readonly uploads: UploadRepository,
    @Inject(PlaceRepository) private readonly places: PlaceRepository,
    @Inject(PersonRepository) private readonly people: PersonRepository,
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

    // Resolve every quoted upload from the server's own record, and refuse any
    // that was not issued to this author. This is the check whose absence let a
    // post point at someone else's media.
    const resolved = await Promise.all(input.uploadIds.map((id) => this.uploads.get(id)));
    const uploads = resolved.map((record, i) => {
      if (record === null) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'Validation failed',
          `Unknown or expired upload ${input.uploadIds[i]}`,
        );
      }
      if (record.userId !== input.authorId) {
        // Deliberately the same message as an unknown upload: telling a caller
        // that an id exists but belongs to someone else discloses another
        // person's activity.
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'Validation failed',
          `Unknown or expired upload ${input.uploadIds[i]}`,
        );
      }
      return record;
    });

    const kinds = new Set(uploads.map((u) => u.kind));
    if (kinds.size > 1) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Validation failed',
        'A post is either images or a single video, not both',
      );
    }
    const mediaKind = kinds.has('video') ? 'video' : 'images';
    if (mediaKind === 'video' && uploads.length !== 1) {
      throw new DomainError(HttpStatus.UNPROCESSABLE_ENTITY, 'Validation failed', 'One video per post');
    }
    if (mediaKind === 'images' && uploads.length > MEDIA_LIMITS.image.maxPerPost) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Validation failed',
        `At most ${MEDIA_LIMITS.image.maxPerPost} images per post`,
      );
    }

    const expandedInterestIds = this.expandInterests(input.interestIds);
    const now = new Date().toISOString();
    const postId = ulid();

    /**
     * 004/FR-015. Validated against the catalogue, so a post cannot point at a
     * place that does not exist or has been retired - the same reasoning that
     * makes an upload id resolved from the server's own record above.
     */
    if (input.placeId) {
      const place = await this.places.find(input.placeId);
      if (!place || place.status !== 'active') {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'Validation failed',
          `Unknown or retired place ${input.placeId}`,
        );
      }
    }

    /**
     * 008/FR-030. Resolved HERE, once, and stored as ids (research R9).
     *
     * `findByHandle` per named handle: at most ten, bounded by `MAX_MENTIONS`,
     * and only on a write. Doing this at read time would let a handle change
     * silently re-point an old mention at somebody else.
     */
    const mentions = input.caption
      ? await resolveMentions(input.caption, async (handle) =>
          (await this.people.findByHandle(handle))?.userId ?? null,
        )
      : [];

    const post: PostItem = {
      postId,
      authorId: input.authorId,
      ...(input.caption ? { caption: input.caption } : {}),
      ...(mentions.length > 0 ? { mentions } : {}),
      interestIds: input.interestIds,
      ...(input.placeId ? { placeId: input.placeId } : {}),
      // FR-013: public unless the author chose otherwise.
      visibility: input.visibility ?? 'public',
      processingState: 'pending',
      mediaKind,
      reactionCount: 0,
      commentCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const media: MediaItemRecord[] = uploads.map((u, ordinal) => ({
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

    /**
     * FR-031, FR-032. NOTHING IS ANNOUNCED HERE, and that is deliberate.
     *
     * A post is `pending` until its media is processed, and `VisibilityFilter`
     * shows a non-ready post only to its author — so a mention announced at
     * publish time is one `NotificationService.canOpen` refuses, on a path that
     * fires once. The announcement lives in `ProcessingService.reconcile`, when
     * the post becomes something the mentioned person can actually open.
     *
     * `NotificationService` still owns every "should this person be told"
     * decision, including the block, which is answered once in
     * `decideAuthoredRules` and never re-asked.
     */

    await this.events.publish({
      type: 'post.created',
      payload: { postId, authorId: input.authorId, mediaKind, keepLocationMetadata: input.keepLocationMetadata === true },
    });

    return post;
  }

  async findById(postId: string): Promise<PostItem | null> {
    return this.posts.findById(postId);
  }

  /** Only the author may change or remove their own post (FR-011, FR-012). */
  private async requireOwnPost(postId: string, userId: string): Promise<PostItem> {
    const post = await this.posts.findById(postId);
    if (!post || post.deletedAt) throw new DomainError(HttpStatus.NOT_FOUND, 'No longer available');
    if (post.authorId !== userId) {
      throw new DomainError(HttpStatus.FORBIDDEN, 'Not your post');
    }
    return post;
  }

  /**
   * FR-011 and FR-017. Caption, interests and visibility all go through the same
   * transaction, so a change lands everywhere or nowhere.
   */
  async update(
    postId: string,
    userId: string,
    patch: {
      caption?: string;
      interestIds?: string[];
      visibility?: PostItem['visibility'];
      /** 004/FR-015. `null` removes the place; omitted leaves it alone. */
      placeId?: string | null;
    },
  ): Promise<PostItem> {
    const post = await this.requireOwnPost(postId, userId);
    const currentExpanded = this.expandInterests(post.interestIds);

    if (patch.interestIds && patch.interestIds.length === 0) {
      // FR-006 holds for edits too: a post cannot be left with no interest.
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Validation failed',
        'A post must remain assigned to at least one interest',
      );
    }

    // Same catalogue check as on publish. An edit is not a lesser write.
    if (patch.placeId) {
      const place = await this.places.find(patch.placeId);
      if (!place || place.status !== 'active') {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'Validation failed',
          `Unknown or retired place ${patch.placeId}`,
        );
      }
    }

    const update: PostUpdate = {
      ...(patch.caption !== undefined ? { caption: patch.caption } : {}),
      ...(patch.visibility ? { visibility: patch.visibility } : {}),
      ...(patch.interestIds ? { expandedInterestIds: this.expandInterests(patch.interestIds) } : {}),
      ...(patch.placeId !== undefined ? { placeId: patch.placeId } : {}),
    };

    const updated = await this.updates.apply({
      post,
      currentExpandedInterestIds: currentExpanded,
      update,
    });

    if (patch.visibility && patch.visibility !== post.visibility) {
      await this.events.publish({
        type: 'post.visibility_changed',
        payload: { postId, from: post.visibility, to: patch.visibility },
      });
    }
    return updated;
  }

  /** FR-012. */
  async remove(postId: string, userId: string): Promise<void> {
    const post = await this.requireOwnPost(postId, userId);
    await this.updates.softDelete(post, this.expandInterests(post.interestIds));
    await this.events.publish({ type: 'post.deleted', payload: { postId, authorId: userId } });
  }
}
