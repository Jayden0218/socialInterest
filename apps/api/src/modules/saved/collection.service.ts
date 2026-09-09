import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { DomainError } from '../../common/errors/problem.filter';
import {
  CollectionRepository,
  type CollectionItem,
} from '../../persistence/collection.repository';
import { SavedPostRepository } from '../../persistence/saved-post.repository';
import { PostRepository } from '../../persistence/post.repository';
import { PostQueryService } from '../posts/post-query.service';
import { VisibilityFilter } from '../../visibility/visibility.filter';

/** A person cannot have unlimited collections; the list is read whole (A55). */
export const MAX_COLLECTIONS = 100;

/**
 * 008/US15, FR-049 to FR-051 — NAMED SHELVES ON THE SAME BOOKCASE.
 *
 * A COLLECTION ADD IS ADDITIVE, NEVER A MOVE. That is the whole of FR-051 and
 * it is enforced in the repository, in one `TransactWriteItems`, rather than by
 * every call site remembering to do both writes — the same argument as the
 * rating aggregate moving with its rows (005/R5). The bug the alternative
 * produces is invisible until somebody goes looking for a post they know they
 * saved, which is long after the move happened.
 *
 * SURFACE 16 of the visibility matrix. A collection is private by key (FR-050),
 * and its POSTS are still resolved through the boundary at read time, for the
 * reason the saved list is: a collection entry is a bookmark, not a copy, so a
 * post whose author has since gone private is simply not there.
 */
@Injectable()
export class CollectionService {
  constructor(
    @Inject(CollectionRepository) private readonly collections: CollectionRepository,
    @Inject(SavedPostRepository) private readonly saved: SavedPostRepository,
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(PostQueryService) private readonly queries: PostQueryService,
    @Inject(VisibilityFilter) private readonly visibility: VisibilityFilter,
  ) {}

  async create(ownerId: string, name: string): Promise<CollectionItem> {
    const existing = await this.collections.list(ownerId, { limit: MAX_COLLECTIONS + 1 });
    if (existing.items.length >= MAX_COLLECTIONS) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'Collection limit reached',
        `You can have at most ${MAX_COLLECTIONS} collections.`,
      );
    }
    const collection: CollectionItem = {
      ownerId,
      collectionId: ulid(),
      name,
      itemCount: 0,
      createdAt: new Date().toISOString(),
    };
    await this.collections.create(collection);
    return collection;
  }

  async list(ownerId: string, opts: { limit?: number; cursor?: string | null } = {}) {
    return this.collections.list(ownerId, opts);
  }

  /**
   * FR-050 — THE ONE AUTHORISATION CHECK, and it is a read of the caller's own
   * partition rather than a comparison.
   *
   * A collection id belonging to somebody else resolves to nothing here, because
   * the key is `USER#<caller>`. So the refusal does not depend on remembering to
   * compare an owner field — it depends on where the row lives. 404 rather than
   * 403, so an id cannot be used to discover that a collection exists.
   */
  private async require(ownerId: string, collectionId: string): Promise<CollectionItem> {
    const collection = await this.collections.find(ownerId, collectionId);
    if (!collection) throw new DomainError(HttpStatus.NOT_FOUND, 'No such collection');
    return collection;
  }

  async rename(ownerId: string, collectionId: string, name: string): Promise<CollectionItem> {
    await this.require(ownerId, collectionId);
    await this.collections.rename(ownerId, collectionId, name);
    return this.require(ownerId, collectionId);
  }

  async remove(ownerId: string, collectionId: string): Promise<void> {
    await this.require(ownerId, collectionId);
    await this.collections.delete(ownerId, collectionId);
  }

  /**
   * FR-049, FR-051. Adding is idempotent and additive.
   *
   * The post is resolved through the BOUNDARY first, exactly as `SavedService`
   * does: collecting a post you cannot see would make a collection a record of
   * what exists rather than of what you chose.
   */
  async addPost(ownerId: string, collectionId: string, postId: string): Promise<void> {
    await this.require(ownerId, collectionId);
    const result = await this.queries.getById({ userId: ownerId }, postId);
    if (!('post' in result)) throw new DomainError(HttpStatus.NOT_FOUND, 'No longer available');

    if (await this.collections.findMembership(ownerId, collectionId, postId)) return;

    // The save that is already there, so the transaction reuses it rather than
    // writing a second `SAVE#` row the marker no longer points at.
    const marker = await this.saved.savedAt(ownerId, postId);
    await this.collections.addPost(
      {
        ownerId,
        collectionId,
        postId,
        authorId: result.post.authorId,
        visibility: result.post.visibility,
        processingState: result.post.processingState,
        savedAt: new Date().toISOString(),
        createdAt: result.post.createdAt,
      },
      marker,
    );
    await this.collections.adjustCount(ownerId, collectionId, 1);
  }

  /** FR-051's converse: taking a post out of a collection leaves the SAVE. */
  async removePost(ownerId: string, collectionId: string, postId: string): Promise<void> {
    await this.require(ownerId, collectionId);
    const membership = await this.collections.findMembership(ownerId, collectionId, postId);
    if (!membership) return;
    await this.collections.removePost(ownerId, collectionId, membership.savedAt, postId);
    await this.collections.adjustCount(ownerId, collectionId, -1);
  }

  /**
   * SURFACE 16. Through `VisibilityFilter`, then re-checked against current
   * state one by one — the same two steps the saved list takes, and for the same
   * reason: nothing updates a membership row when the post it points at is made
   * private, so filtering on the row alone would return exactly what FR-044 says
   * must not appear.
   */
  async listPosts(
    ownerId: string,
    collectionId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
    await this.require(ownerId, collectionId);
    const page = await this.collections.listPosts(ownerId, collectionId, opts);
    const cache = this.visibility.newRequestCache();
    const visible = await this.visibility.filter(
      { userId: ownerId },
      page.items.map((m) => ({
        postId: m.postId,
        authorId: m.authorId,
        visibility: m.visibility,
        processingState: m.processingState,
        createdAt: m.createdAt,
      })),
      cache,
    );

    const items = await Promise.all(
      visible.map(async (candidate) => {
        const current = await this.queries.getById({ userId: ownerId }, candidate.postId);
        if (!('post' in current)) return null;
        return this.queries.toResponse(current.post, await this.posts.listMedia(candidate.postId));
      }),
    );

    return {
      items: items.filter((p): p is Record<string, unknown> => p !== null),
      nextCursor: page.nextCursor,
    };
  }
}
