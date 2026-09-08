export interface PresignedUpload {
  uploadId: string;
  url: string;
  method: 'PUT' | 'POST';
  headers: Record<string, string>;
  expiresAt: string;
  key: string;
}

/**
 * Media bytes never pass through the API (research D5) - the client uploads
 * straight to the store with a presigned URL.
 */
export interface ObjectStore {
  createUploadTarget(input: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUpload>;
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  /**
   * A URL for an object that is readable WITHOUT authorisation.
   *
   * Correct only where something in front of the bucket authorises the read - a
   * CDN with signed URLs, for instance. On the local profile nothing does, so
   * this returns a URL the object store refuses. Kept because a hosted profile
   * may legitimately want it; NOT the way media reaches a client.
   */
  publicUrl(key: string): string;
  /**
   * 006/R4b. A time-limited URL for a viewer who has ALREADY been authorised.
   *
   * This grants no permission by itself - it is the last step after
   * `VisibilityFilter` has decided the viewer may see the post. Issuing one for
   * a post the viewer cannot see would hand out exactly what the filter refused,
   * so the only correct caller is one that has already asked it.
   *
   * Time-limited because a signed URL is a bearer token for that one object
   * until it expires: short enough that a leaked link goes stale, long enough
   * that a person can scroll a feed without every image expiring under them.
   */
  presignedGetUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export const OBJECT_STORE = Symbol('ObjectStore');
