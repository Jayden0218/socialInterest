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

  it('round-trips the sample media the compose flow actually publishes', async () => {
    const media = SAMPLE_MEDIA[0]!;
    const bytes = (await readMediaBytes(media.uri, neverCalled)) as Uint8Array;

    expect(bytes[0]).toBe(0x89);
    expect(String.fromCharCode(...bytes.slice(1, 4))).toBe('PNG');
    // sizeBytes is what the app declares to the server when asking for an
    // upload target; if the decode disagreed with it the server would be told
    // one length and sent another.
    expect(bytes.byteLength).toBe(media.sizeBytes);
  });

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
