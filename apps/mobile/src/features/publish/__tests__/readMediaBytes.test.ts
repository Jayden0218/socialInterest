import { readMediaBytes } from '../uploadFlow';
import { SAMPLE_MEDIA } from '../sampleMedia';

/**
 * The bytes an upload sends, for each kind of URI the app can hold.
 *
 * `runUpload` used to read every URI with `fetch(uri).blob()`. A browser
 * resolves a `data:` URI that way and returns a Blob; React Native's fetch and
 * Blob support for `data:` is not the same, so the browser journeys passed
 * while the device could not upload at all — the slot never reached `uploaded`,
 * which left the publish button disabled and made tapping it a silent no-op
 * (device runs 18–20).
 *
 * A `data:` URI already contains its bytes. These assert they come out intact
 * and that a real device URI is still read through fetch.
 */
const neverCalled = (() => {
  throw new Error('fetch must not be used for a data: URI');
}) as unknown as typeof globalThis.fetch;

describe('readMediaBytes', () => {
  it('decodes base64 data: URIs without touching the network', async () => {
    const bytes = (await readMediaBytes(
      'data:image/png;base64,iVBORw0KGgo=',
      neverCalled,
    )) as Uint8Array;

    // The PNG magic number, which is what the server will check.
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  /**
   * EVERY entry, not `SAMPLE_MEDIA[0]`.
   *
   * This test checked index 0 alone, which was sound while the sample set held
   * one image and became unsound the moment 008/US1 added two more - a declared
   * size wrong on entry 1 or 2 would have gone to the server unchecked. It is
   * also, exactly, the shape of the defect this feature exists to end: an array
   * with several members and a reader that looks at the first.
   */
  it.each(SAMPLE_MEDIA.map((m, i) => [i, m] as const))(
    'round-trips SAMPLE_MEDIA[%i], and its declared size is the size it uploads',
    async (index, media) => {
      const bytes = (await readMediaBytes(media.uri, neverCalled)) as Uint8Array;

      // sizeBytes is what the app declares to the server when asking for an
      // upload target; if the decode disagreed with it the server would be told
      // one length and sent another. The PNG's was 68 for 70 bytes, and this
      // assertion is the only reason anyone found out.
      expect({ index, declared: media.sizeBytes, actual: bytes.byteLength })
        .toEqual({ index, declared: media.sizeBytes, actual: media.sizeBytes });

      if (media.kind === 'image') {
        expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
      }
    },
  );

  it('decodes a non-base64 data: URI', async () => {
    const bytes = (await readMediaBytes('data:text/plain,hello%20there', neverCalled)) as Uint8Array;
    expect(new TextDecoder().decode(bytes)).toBe('hello there');
  });

  it('still fetches a real device URI', async () => {
    let asked: string | null = null;
    const fakeFetch = (async (uri: string) => {
      asked = uri;
      return { blob: async () => 'BLOB' } as unknown as Response;
    }) as unknown as typeof globalThis.fetch;

    const body = await readMediaBytes('file:///storage/emulated/0/Pictures/x.jpg', fakeFetch);

    expect(asked).toBe('file:///storage/emulated/0/Pictures/x.jpg');
    expect(body).toBe('BLOB');
  });
});
