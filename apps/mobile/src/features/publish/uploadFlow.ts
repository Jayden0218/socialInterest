import type { ApiClient } from '@sih/shared';
import type { PickedMedia } from './MediaPickerScreen';

/**
 * All this flow needs is something that can issue a call.
 *
 * It used to take the generated `ApiClient` directly, which predates
 * apps/mobile/src/data - so the compose screen could not be driven by the data
 * layer the rest of the app uses without reaching past it. Both `ApiClient` and
 * `DataClient` satisfy this, and `DataClient` additionally converts failures
 * into DataError, which is what the screens render.
 */
export type UploadCaller = Pick<ApiClient, 'call'>;

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
/**
 * Decodes base64 without `atob` or `Buffer`.
 *
 * Neither is dependable across the runtimes this file has to work in - the
 * browser bundle, jest, and React Native - and this is twenty lines.
 */
function decodeBase64(b64: string): Uint8Array {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (ALPHABET.indexOf(clean[i] ?? 'A') << 18) |
      (ALPHABET.indexOf(clean[i + 1] ?? 'A') << 12) |
      (ALPHABET.indexOf(clean[i + 2] ?? 'A') << 6) |
      ALPHABET.indexOf(clean[i + 3] ?? 'A');
    if (o < out.length) out[o++] = (n >> 16) & 0xff;
    if (o < out.length) out[o++] = (n >> 8) & 0xff;
    if (o < out.length) out[o++] = n & 0xff;
  }
  return out;
}

/**
 * The bytes to upload, read the way each kind of URI should be read.
 *
 * A `data:` URI ALREADY CONTAINS the bytes. Fetching it sends them through the
 * networking stack to get back what was in the string all along, and whether
 * that works depends on the platform: browsers handle `data:` in fetch and
 * return a Blob; React Native's fetch and Blob support for it is not the same.
 * The browser journeys therefore passed while the device could not upload at
 * all - the upload never reached `uploaded`, so the publish button stayed
 * disabled and tapping it did nothing (runs 18-20).
 *
 * A real device URI - `file://`, `content://` - is fetched as before, because
 * there the network stack is genuinely how you read it.
 */
export async function readMediaBytes(
  uri: string,
  doFetch: typeof globalThis.fetch,
): Promise<Uint8Array | Blob> {
  const match = /^data:[^;,]*(;base64)?,(.*)$/s.exec(uri);
  if (match) {
    const [, isBase64, payload = ''] = match;
    return isBase64
      ? decodeBase64(payload)
      : new TextEncoder().encode(decodeURIComponent(payload));
  }
  return (await doFetch(uri)).blob();
}

export async function runUpload(
  client: UploadCaller,
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
    // `BodyInit` in the DOM lib does not include a bare Uint8Array, but every
    // runtime this ships to accepts one - React Native's fetch passes it to
    // XHR.send, and undici accepts it. The cast is narrower than widening the
    // helper's return type to `any`, and the helper stays honestly typed.
    const body = (await readMediaBytes(current.media.uri, doFetch)) as unknown as BodyInit;
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
