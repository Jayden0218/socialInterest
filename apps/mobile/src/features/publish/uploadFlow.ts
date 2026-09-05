import type { ApiClient } from '@sih/shared';
import type { PickedMedia } from './MediaPickerScreen';

export type UploadStage = 'idle' | 'requesting' | 'uploading' | 'uploaded' | 'failed';

export interface UploadSlot {
  media: PickedMedia;
  stage: UploadStage;
  progress: number;
  /** Retained across a failure so a retry needs no re-selection (FR-008). */
  uploadId?: string;
  key?: string;
  error?: string;
}

export const newSlot = (media: PickedMedia): UploadSlot => ({
  media,
  stage: 'idle',
  progress: 0,
});

/**
 * FR-008: a failed upload is retried without re-selecting the media.
 *
 * The slot keeps the picked media and, once issued, its upload target - so a
 * retry resumes from wherever it got to rather than sending the person back to
 * the picker. That is the requirement; showing a progress bar is the easy half.
 */
export async function runUpload(
  client: ApiClient,
  slot: UploadSlot,
  onChange: (next: UploadSlot) => void,
  deps: { fetch?: typeof globalThis.fetch } = {},
): Promise<UploadSlot> {
  const doFetch = deps.fetch ?? globalThis.fetch;
  let current: UploadSlot = { ...slot, stage: 'requesting', error: undefined };
  onChange(current);

  try {
    // Reuse the existing target on retry; only ask for a new one if we have none.
    if (!current.uploadId) {
      const target = await client.call<{ uploadId: string; url: string; headers: Record<string, string> }>(
        'postMediaUploads',
        {
          body: {
            kind: current.media.kind,
            contentType: current.media.contentType,
            sizeBytes: current.media.sizeBytes,
            ...(current.media.durationMs ? { durationMs: current.media.durationMs } : {}),
          },
        },
      );
      current = { ...current, uploadId: target.uploadId, key: target.url };
      (current as UploadSlot & { url?: string }).url = target.url;
    }

    current = { ...current, stage: 'uploading', progress: 0 };
    onChange(current);

    const url = (current as UploadSlot & { url?: string }).url!;
    const body = await (await doFetch(current.media.uri)).blob();
    const res = await doFetch(url, {
      method: 'PUT',
      headers: { 'content-type': current.media.contentType },
      body,
    });
    if (!res.ok) throw new Error(`upload failed with ${res.status}`);

    current = { ...current, stage: 'uploaded', progress: 1 };
  } catch (e) {
    // The uploadId and picked media survive, which is what makes retry cheap.
    current = { ...current, stage: 'failed', error: e instanceof Error ? e.message : String(e) };
  }

  onChange(current);
  return current;
}

export const canRetry = (slot: UploadSlot): boolean => slot.stage === 'failed';
export const allUploaded = (slots: UploadSlot[]): boolean =>
  slots.length > 0 && slots.every((s) => s.stage === 'uploaded');
