import type { Post } from '@sih/shared';
import type { DataClient } from './client';
import type { PostPage } from './people';

/**
 * Saved posts (004/US5).
 *
 * A SAVE IS A BOOKMARK, NOT A COPY. There is deliberately no endpoint that
 * takes a person's handle - the list is reachable only as "mine", so there is
 * no route an authorisation bug could expose (FR-038).
 */
export class SavedData {
  constructor(private readonly client: DataClient) {}

  save(postId: string): Promise<void> {
    return this.client.call<void>('putPostsByPostIdSave', { params: { postId } });
  }

  unsave(postId: string): Promise<void> {
    return this.client.call<void>('deletePostsByPostIdSave', { params: { postId } });
  }

  /**
   * FR-039. A post the saver may no longer see is ABSENT, never stale - the
   * server resolves each one against its current visibility at read time.
   */
  list(opts: { limit?: number; cursor?: string } = {}): Promise<PostPage> {
    return this.client.call<PostPage>('getMeSaved', {
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }

  /**
   * 008/US15, FR-049 to FR-051 — NAMED SHELVES ON THE SAME BOOKCASE.
   *
   * A COLLECTION ADD IS ADDITIVE, NEVER A MOVE. `add` below does not remove the
   * post from `list()` above, and neither does `deleteCollection` — the server
   * writes the membership row and the save in one transaction, so the app
   * cannot get this wrong even by trying.
   */
  collections(opts: { limit?: number; cursor?: string } = {}): Promise<CollectionPage> {
    return this.client.call<CollectionPage>('getMeCollections', {
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }

  createCollection(name: string): Promise<Collection> {
    return this.client.call<Collection>('postMeCollections', { body: { name } });
  }

  renameCollection(collectionId: string, name: string): Promise<Collection> {
    return this.client.call<Collection>('patchMeCollectionsByCollectionId', {
      params: { collectionId },
      body: { name },
    });
  }

  deleteCollection(collectionId: string): Promise<void> {
    return this.client.call<void>('deleteMeCollectionsByCollectionId', {
      params: { collectionId },
    });
  }

  /** SURFACE 16. Resolved through the boundary against each post's CURRENT state. */
  collectionPosts(
    collectionId: string,
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<PostPage> {
    return this.client.call<PostPage>('getMeCollectionsByCollectionIdPosts', {
      params: { collectionId },
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }

  addToCollection(collectionId: string, postId: string): Promise<void> {
    return this.client.call<void>('putMeCollectionsByCollectionIdPostsByPostId', {
      params: { collectionId, postId },
    });
  }

  removeFromCollection(collectionId: string, postId: string): Promise<void> {
    return this.client.call<void>('deleteMeCollectionsByCollectionIdPostsByPostId', {
      params: { collectionId, postId },
    });
  }
}

/** 008/FR-049. */
export interface Collection {
  collectionId: string;
  name: string;
  itemCount: number;
  createdAt: string;
}

export interface CollectionPage {
  items: Collection[];
  page: { nextCursor: string | null; emptyStateHint?: string | null };
}

export type SavedPost = Post;
