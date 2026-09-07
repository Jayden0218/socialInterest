export interface MediaJob {
  jobId: string;
  state: 'queued' | 'running' | 'complete' | 'failed';
  renditions?: Record<string, string>;
  posterKey?: string;
  error?: string;
}

/**
 * WARNING (research D9): the local ffmpeg adapter and the AWS MediaConvert adapter
 * are DIFFERENT IMPLEMENTATIONS of this port, not emulations of one another. Codec
 * defaults, HLS segmenting, and failure modes differ. A green test against ffmpeg
 * is NOT evidence the MediaConvert path works - see docs/mediaconvert-smoke-test.md.
 *
 * Keep this contract narrow so the divergence stays contained.
 */
export interface MediaProcessor {
  /** FR-009: produce playable renditions plus a poster frame. */
  submitVideoJob(input: { sourceKey: string; outputPrefix: string }): Promise<MediaJob>;
  getJob(jobId: string): Promise<MediaJob>;
  /** FR-010: strip location metadata server-side. Returns the stripped bytes. */
  processImage(input: {
    source: Buffer;
    contentType: string;
    keepLocationMetadata: boolean;
  }): Promise<{ body: Buffer; width: number; height: number; exifStripped: boolean }>;
}

export const MEDIA_PROCESSOR = Symbol('MediaProcessor');
