import type { Post, Visibility } from '@sih/shared';
import type { DataClient } from './client';
import type { PostPage } from './interests';

export interface UploadTarget {
  uploadId: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  expiresAt: string;
}

/** Presign, upload, publish, read, edit and delete (002/T021). */
export class PostsData {
  constructor(private readonly client: DataClient) {}

  /**
   * Caps are checked here, before any bytes move (FR-005). A 413 or 415 from this
   * call is the point of the requirement - learning about the limit after a long
   * upload is the failure it exists to prevent.
   */
  createUploadTarget(input: {
    kind: 'image' | 'video' | 'avatar';
    contentType: string;
    sizeBytes: number;
    durationMs?: number;
  }): Promise<UploadTarget> {
    return this.client.call<UploadTarget>('postMediaUploads', { body: input });
  }

  /** PUTs the bytes at the presigned target. Not an API call - it goes to the store. */
  async uploadBytes(target: UploadTarget, body: Uint8Array, contentType: string): Promise<void> {
    const res = await fetch(target.url, {
      method: target.method,
      headers: { 'content-type': contentType, ...(target.headers ?? {}) },
      // A Uint8Array is a valid fetch body in every runtime this ships to. The
      // exact type differs between the app's DOM lib and the Node-typed e2e
      // package, so the cast is at the boundary rather than in either lib.
      body: body as unknown as Parameters<typeof fetch>[1] extends { body?: infer B } ? B : never,
    });
    if (!res.ok) {
      throw new Error(`upload failed: ${res.status} ${await res.text()}`);
    }
  }

  /**
   * Quotes upload ids only. The server derives the object key and kind from its
   * own record of what it issued - the client cannot name someone else's media.
   */
  publish(input: {
    uploadIds: string[];
    interestIds: string[];
    caption?: string;
    visibility?: Visibility;
    keepLocationMetadata?: boolean;
  }): Promise<Post> {
    return this.client.call<Post>('postPosts', { body: input });
  }

  get(postId: string): Promise<Post> {
    return this.client.call<Post>('getPostsByPostId', { params: { postId } });
  }

  update(postId: string, patch: { caption?: string; interestIds?: string[]; visibility?: Visibility }): Promise<Post> {
    return this.client.call<Post>('patchPostsByPostId', { params: { postId }, body: patch });
  }

  remove(postId: string): Promise<void> {
    return this.client.call<void>('deletePostsByPostId', { params: { postId } });
  }

  shareLink(postId: string): Promise<{ url: string }> {
    return this.client.call<{ url: string }>('postPostsByPostIdShareLink', { params: { postId } });
  }

  byHandle(handle: string, opts: { limit?: number; cursor?: string } = {}): Promise<PostPage> {
    return this.client.call<PostPage>('getPeopleByHandlePosts', {
      params: { handle },
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }
}
