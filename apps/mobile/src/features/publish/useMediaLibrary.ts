import { useCallback, useState } from 'react';
import type { PickedMedia } from './MediaPickerScreen';
import { SAMPLE_MEDIA } from './sampleMedia';

/**
 * Media from the device's own library, with the sample set as the fallback.
 *
 * `expo-image-picker` is imported LAZILY, through require inside a try. Three
 * reasons, all of which have bitten this project's test suites before:
 *
 *   - the browser journeys run this same code through react-native-web, where
 *     the native module does not exist;
 *   - jest resolves modules at import time, so a top-level import would need a
 *     mock in every suite that renders compose, whether or not it picks media;
 *   - a build without the native module linked should degrade to the sample
 *     media, not crash on launch.
 *
 * 003/FR-012: refusing the permission must produce an explanation, not an app
 * that appears broken. `status` distinguishes the three outcomes a person can
 * actually be in, and the compose screen renders each differently.
 */
export type LibraryStatus =
  | 'idle'
  | 'unavailable' // no native picker in this build - the sample set is used
  | 'denied' // the person refused, and the app must say what it needs
  | 'ready';

interface Picker {
  requestMediaLibraryPermissionsAsync: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  launchImageLibraryAsync: (opts: Record<string, unknown>) => Promise<{
    canceled: boolean;
    assets?: {
      uri: string;
      mimeType?: string;
      fileSize?: number;
      duration?: number | null;
      type?: string;
    }[];
  }>;
  MediaTypeOptions?: { All: unknown };
}

function loadPicker(): Picker | null {
  try {
    return require('expo-image-picker') as Picker;
  } catch {
    return null;
  }
}

function toPickedMedia(asset: {
  uri: string;
  mimeType?: string;
  fileSize?: number;
  duration?: number | null;
  type?: string;
}): PickedMedia {
  const kind: 'image' | 'video' = asset.type === 'video' ? 'video' : 'image';
  return {
    uri: asset.uri,
    kind,
    // The picker does not always report a MIME type; the server derives kind
    // and key from its own upload record either way, so a sensible default here
    // cannot mislabel stored media.
    contentType: asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
    sizeBytes: asset.fileSize ?? 0,
    ...(asset.duration !== null && asset.duration !== undefined
      ? { durationMs: Math.round(asset.duration) }
      : {}),
  };
}

export interface MediaLibrary {
  status: LibraryStatus;
  /** What compose can publish right now. Never empty on the fallback path. */
  available: PickedMedia[];
  /** Opens the device library. Safe to call when unavailable - it no-ops. */
  pick: () => Promise<void>;
}

export function useMediaLibrary(): MediaLibrary {
  const [status, setStatus] = useState<LibraryStatus>('idle');
  const [available, setAvailable] = useState<PickedMedia[]>(SAMPLE_MEDIA);

  const pick = useCallback(async () => {
    const picker = loadPicker();
    if (!picker) {
      // T039. The browser journeys reach here, and publish must still work end
      // to end for them - the bytes are real and the upload path is the real
      // one, so what J-04 and J-05 are about is unaffected.
      setStatus('unavailable');
      setAvailable(SAMPLE_MEDIA);
      return;
    }

    const permission = await picker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      // Not a silent fallback to the sample set: a person who refused must be
      // told what was refused and why it is needed (FR-012). Falling back
      // quietly here would make a denied permission look like a working app
      // that publishes something they did not choose.
      setStatus('denied');
      return;
    }

    const result = await picker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      selectionLimit: 10,
      ...(picker.MediaTypeOptions ? { mediaTypes: picker.MediaTypeOptions.All } : {}),
    });
    if (result.canceled || !result.assets?.length) {
      // Cancelling is not an error and not a denial. Leave what was there.
      setStatus('ready');
      return;
    }
    setStatus('ready');
    setAvailable(result.assets.map(toPickedMedia));
  }, []);

  return { status, available, pick };
}
