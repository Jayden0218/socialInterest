import type { PickedMedia } from './MediaPickerScreen';

/**
 * Media the compose flow can publish without a native gallery picker.
 *
 * This build has no picker dependency, and a device journey that has to drive an
 * OS gallery dialog fails for reasons that have nothing to do with the product.
 * What J-04 and J-05 are actually about - choose an interest, upload every item,
 * publish, see it in the feed - runs end to end over the real presign/PUT/publish
 * path with these, because the bytes are real bytes and the server derives key
 * and kind from its own upload record either way.
 *
 * Replace this with a picker when one is installed; nothing downstream changes,
 * because ComposeContainer only ever receives `PickedMedia[]`.
 */

/** A 1x1 PNG. Small enough to inline, real enough to upload and transcode. */
const PNG_1X1 =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export const SAMPLE_MEDIA: PickedMedia[] = [
  // 70, not 68. The declared length is what the app tells the server when it
  // asks for an upload target, and it was two bytes short of what the base64
  // actually decodes to - so the app announced one size and uploaded another.
  // Caught by readMediaBytes.test.ts asserting the two agree, which is the
  // whole reason that assertion is there.
  { uri: PNG_1X1, kind: 'image', contentType: 'image/png', sizeBytes: 70 },
];
