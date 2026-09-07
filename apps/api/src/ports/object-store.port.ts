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
  publicUrl(key: string): string;
}

export const OBJECT_STORE = Symbol('ObjectStore');
