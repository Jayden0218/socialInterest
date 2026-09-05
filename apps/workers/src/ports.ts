/**
 * Structural copies of the API's port interfaces. Workers depend on the shape,
 * not on the API package, so a worker can be deployed independently.
 */
export interface ObjectStore {
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
}

export interface MediaJob {
  jobId: string;
  state: 'queued' | 'running' | 'complete' | 'failed';
  renditions?: Record<string, string>;
  posterKey?: string;
  error?: string;
}

export interface MediaProcessor {
  submitVideoJob(input: { sourceKey: string; outputPrefix: string }): Promise<MediaJob>;
  getJob(jobId: string): Promise<MediaJob>;
  processImage(input: {
    source: Buffer;
    contentType: string;
    keepLocationMetadata: boolean;
  }): Promise<{ body: Buffer; width: number; height: number; exifStripped: boolean }>;
}
