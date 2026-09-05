import type { MediaProcessor } from './ports';

export interface VideoJobInput {
  postId: string;
  ordinal: number;
  originalKey: string;
}

export interface VideoJobDeps {
  processor: MediaProcessor;
  updateMediaItem(
    postId: string,
    ordinal: number,
    patch: {
      renditions: Record<string, string>;
      posterKey?: string;
      exifStripped: boolean;
      processingState: 'processing' | 'ready' | 'failed';
    },
  ): Promise<void>;
  reconcilePost(postId: string): Promise<void>;
  /** Poll interval; injected so tests do not wait in real time. */
  waitMs?(ms: number): Promise<void>;
}

const DEFAULT_POLL_MS = 2000;
const MAX_POLLS = 120;

/**
 * FR-009: produce playable renditions plus a poster frame shown before playback.
 *
 * Submit-then-poll rather than transcode-inline, because that is the shape the
 * MediaProcessor port has - and the port has that shape because MediaConvert
 * works that way. Keeping the local path the same shape is what stops the two
 * adapters diverging further than research D9 already documents.
 */
export async function handleVideoJob(input: VideoJobInput, deps: VideoJobDeps): Promise<void> {
  const wait = deps.waitMs ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  try {
    await deps.updateMediaItem(input.postId, input.ordinal, {
      renditions: {},
      exifStripped: true, // container metadata is dropped during transcode
      processingState: 'processing',
    });
    await deps.reconcilePost(input.postId);

    const job = await deps.processor.submitVideoJob({
      sourceKey: input.originalKey,
      outputPrefix: `posts/${input.postId}/${String(input.ordinal).padStart(3, '0')}`,
    });

    let current = job;
    for (let i = 0; i < MAX_POLLS && (current.state === 'queued' || current.state === 'running'); i++) {
      await wait(DEFAULT_POLL_MS);
      current = await deps.processor.getJob(job.jobId);
    }

    if (current.state !== 'complete') {
      throw new Error(current.error ?? `transcode did not complete (state=${current.state})`);
    }

    await deps.updateMediaItem(input.postId, input.ordinal, {
      renditions: current.renditions ?? {},
      ...(current.posterKey ? { posterKey: current.posterKey } : {}),
      exifStripped: true,
      processingState: 'ready',
    });
  } catch (error) {
    await deps.updateMediaItem(input.postId, input.ordinal, {
      renditions: {},
      exifStripped: false,
      processingState: 'failed',
    });
    throw error;
  } finally {
    await deps.reconcilePost(input.postId);
  }
}
