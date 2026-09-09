import { Injectable } from '@nestjs/common';
import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { ProcessingState, Visibility } from '@sih/shared';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';

export interface CollectionItem {
  ownerId: string;
  collectionId: string;
  /**
   * User-generated text with an AUDIENCE OF ONE — see the note on
   * `collections-are-not-reportable.spec.ts` for why that makes it the one piece
   * of user-generated text in this product that is not reportable.
   */
  name: string;
  itemCount: number;
  createdAt: string;
}

export interface CollectionMembership {
  ownerId: string;
  collectionId: string;
  postId: string;
  authorId: string;
  visibility: Visibility;
  processingState: ProcessingState;
  savedAt: string;
  createdAt: string;
}

/**
 * A55, A56 — 008/FR-049 to FR-051. PRIVATE BY KEY, like saved posts and drafts.
 *
 * Collections live under the owner's own partition and no index projects them,
 * so there is no query anybody else can write that reaches one. That is a
 * stronger guarantee than a check in a service, because it does not depend on
 * the check being called — `collection-privacy.spec.ts` drives the request
 * directly with another person's collection id anyway, because Principle III
 * asks for the hostile path and not for the argument.
 *
 * `visibility` and `processingState` are denormalised on the membership row for
 * the same reason the saved list denormalises them: the boundary runs on the
 * Query result rather than fetching each candidate. They can go stale, which is
 * CORRECT — a collection entry is a bookmark, not a copy, and the filter
 * resolves against current state at read time whatever this row says. A post
 * whose author went private after it was collected stops being readable, and
 * the row stays (008/US13's saved-list case, one surface along).
 */
@Injectable()
export class CollectionRepository extends BaseRepository {
  async create(item: CollectionItem): Promise<void> {
    await this.putItem({
      ...keys.collection(item.ownerId, item.collectionId),
      type: 'Collection',
      ...item,
    });
  }

  async find(ownerId: string, collectionId: string): Promise<CollectionItem | null> {
    return this.getItem<CollectionItem>(keys.collection(ownerId, collectionId));
  }

  /** A55. */
  async list(
    ownerId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<CollectionItem>> {
    return this.query<CollectionItem>(`USER#${ownerId}`, {
      skPrefix: SK_PREFIX.collection,
      limit: opts.limit ?? 50,
      cursor: opts.cursor ?? null,
      ascending: true,
    });
  }

  async rename(ownerId: string, collectionId: string, name: string): Promise<void> {
    await this.updateItem(keys.collection(ownerId, collectionId), { name });
  }

  /**
   * Deleting a collection removes its memberships and NOT the saved posts.
   *
   * FR-051 in the other direction: if adding to a collection cannot remove a
   * post from the saved list, neither can deleting the collection. A person
   * tidying their shelves has not asked to lose the books.
   */
  async delete(ownerId: string, collectionId: string): Promise<void> {
    let cursor: string | null = null;
    do {
      const page: Page<CollectionMembership> = await this.listPosts(ownerId, collectionId, {
        limit: 100,
        cursor,
      });
      for (const item of page.items) {
        await this.deleteItem(
          keys.collectionItem(ownerId, collectionId, item.savedAt, item.postId),
        );
      }
      cursor = page.nextCursor;
    } while (cursor);
    await this.deleteItem(keys.collection(ownerId, collectionId));
  }

  /**
   * 008/FR-049 + FR-051 — ONE TRANSACTION, AND THAT IS THE WHOLE GUARANTEE.
   *
   * The membership row and the `savedPost` rows (A32/A33) are written together,
   * so a post cannot be in a collection and absent from the undifferentiated
   * saved list. FR-051 is then unbreakable BY ANY PATH rather than upheld by
   * whichever call sites remember to do both — the same argument as the rating
   * aggregate moving with its rows (005/R5), and as one `VisibilityFilter`.
   *
   * A COLLECTION ADD IS ADDITIVE, NEVER A MOVE (research R15). The bug the
   * alternative produces is invisible until somebody goes looking for a post
   * they know they saved, which is long after the move happened.
   *
   * `existingSavedAt` is the save that is already there. Reused rather than
   * rewritten: a fresh `savedAt` would write a SECOND `SAVE#` row under a new
   * sort key while the `SAVEBY#` marker moved to it, orphaning the first — a
   * duplicate in the saved list that no unsave can reach.
   */
  async addPost(item: CollectionMembership, existingSavedAt: string | null): Promise<void> {
    const savedAt = existingSavedAt ?? item.savedAt;
    const writes: NonNullable<TransactWriteCommandInput['TransactItems']> = [
      {
        Put: {
          TableName: this.tableName,
          Item: {
            ...keys.collectionItem(item.ownerId, item.collectionId, savedAt, item.postId),
            type: 'CollectionItem',
            ...item,
            savedAt,
          },
        },
      },
    ];
    if (!existingSavedAt) {
      writes.push(
        {
          Put: {
            TableName: this.tableName,
            Item: {
              ...keys.savedPost(item.ownerId, savedAt, item.postId),
              type: 'SavedPost',
              userId: item.ownerId,
              postId: item.postId,
              authorId: item.authorId,
              visibility: item.visibility,
              processingState: item.processingState,
              savedAt,
              createdAt: item.createdAt,
            },
          },
        },
        {
          Put: {
            TableName: this.tableName,
            Item: {
              ...keys.savedPostBy(item.ownerId, item.postId),
              type: 'SavedPostBy',
              userId: item.ownerId,
              postId: item.postId,
              savedAt,
            },
          },
        },
      );
    }
    await this.transact(writes);
  }

  /**
   * FR-051, the other direction. Removing from a collection leaves the SAVE.
   *
   * If adding to a collection cannot remove a post from the saved list, taking
   * it out of one cannot either — the person filed it, they did not unsave it.
   */
  async removePost(ownerId: string, collectionId: string, savedAt: string, postId: string): Promise<void> {
    await this.deleteItem(keys.collectionItem(ownerId, collectionId, savedAt, postId));
  }

  /** A56 — newest first within the collection. */
  async listPosts(
    ownerId: string,
    collectionId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<CollectionMembership>> {
    return this.query<CollectionMembership>(`USER#${ownerId}`, {
      skPrefix: `COLLITEM#${collectionId}#`,
      limit: opts.limit ?? 20,
      cursor: opts.cursor ?? null,
    });
  }

  async findMembership(
    ownerId: string,
    collectionId: string,
    postId: string,
  ): Promise<CollectionMembership | null> {
    // The sort key carries `savedAt`, which the caller does not know, so this is
    // a bounded prefix scan rather than a point read. Bounded by the collection.
    let cursor: string | null = null;
    do {
      const page: Page<CollectionMembership> = await this.listPosts(ownerId, collectionId, {
        limit: 100,
        cursor,
      });
      const found = page.items.find((i) => i.postId === postId);
      if (found) return found;
      cursor = page.nextCursor;
    } while (cursor);
    return null;
  }

  async adjustCount(ownerId: string, collectionId: string, delta: number): Promise<void> {
    const existing = await this.find(ownerId, collectionId);
    if (!existing) return;
    await this.updateItem(keys.collection(ownerId, collectionId), {
      itemCount: Math.max(0, existing.itemCount + delta),
    });
  }
}
