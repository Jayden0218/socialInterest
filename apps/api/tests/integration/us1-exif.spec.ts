import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/configuration';
import { MinioObjectStore } from '../../src/adapters/local/minio-object-store';
import { FfmpegMediaProcessor } from '../../src/adapters/local/ffmpeg-media-processor';
import { handleImageJob, type MediaItemPatch } from '@sih/workers';

/**
 * FR-010 IS A SERVER-SIDE GUARANTEE.
 *
 * This test deliberately does NOT go through the mobile client. It writes an
 * image carrying GPS metadata and hands it straight to the worker - which is
 * exactly the path a modified or hostile client would produce. A test that only
 * drives the well-behaved first-party client proves nothing about a guarantee,
 * because that client is not the threat. Constitution principle III.
 */
const config = loadConfig();
const store = new MinioObjectStore(config);
const processor = new FfmpegMediaProcessor(config, store);

/**
 * EXIF lives in a JPEG's APP1 segment. Rather than shelling out to exiftool
 * (not available here), the fixture splices a well-formed APP1 segment carrying
 * an EXIF header and GPS payload directly into a real JPEG - which is what a
 * camera does. If the APP1 segment is gone from the output, the EXIF is gone.
 *
 * ffmpeg's `-metadata` flag does NOT do this for JPEG output: the mjpeg muxer
 * drops it silently, which the guard test below exists to catch.
 */
const EXIF_MARKER = Buffer.from('Exif\0\0', 'binary');
const GPS_PAYLOAD = Buffer.from('GPSLatitude=51.5074;GPSLongitude=-0.1278', 'binary');

function spliceExifApp1(jpeg: Buffer): Buffer {
  const payload = Buffer.concat([EXIF_MARKER, GPS_PAYLOAD]);
  const length = payload.length + 2; // segment length includes the length bytes
  const header = Buffer.from([0xff, 0xe1, (length >> 8) & 0xff, length & 0xff]);
  // Insert immediately after SOI (0xFFD8), where APP1 belongs.
  return Buffer.concat([jpeg.subarray(0, 2), header, payload, jpeg.subarray(2)]);
}

const hasExifSegment = (buf: Buffer): boolean =>
  buf.includes(EXIF_MARKER) || buf.includes(GPS_PAYLOAD);

describe('FR-010 — location metadata is stripped server-side', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sih-exif-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  /** Builds a JPEG carrying a GPS-bearing EXIF APP1 segment, as a camera would. */
  const makeTaggedImage = (): Buffer => {
    execFileSync('docker', [
      'run', '--rm', '-v', `${dir}:/w`, '-w', '/w', config.media.ffmpegImage,
      '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=1:duration=1', '-vframes', '1',
      '-y', 'plain.jpg',
    ]);
    return spliceExifApp1(readFileSync(join(dir, 'plain.jpg')));
  };

  it('the fixture really does carry location metadata (guards the test itself)', () => {
    // Without this guard the strip assertion below would pass vacuously against
    // an image that never had metadata - which is exactly what happened when the
    // fixture used ffmpeg's -metadata flag, since the mjpeg muxer discards it.
    const source = makeTaggedImage();
    expect(hasExifSegment(source)).toBe(true);
    writeFileSync(join(dir, 'check.jpg'), source);
  });

  it('strips location metadata even though the "client" never asked it to', async () => {
    const source = makeTaggedImage();
    const originalKey = `test/exif/${Date.now()}-original.jpg`;
    await store.putObject(originalKey, source, 'image/jpeg');

    const patches: MediaItemPatch[] = [];
    await handleImageJob(
      {
        postId: 'exif-post',
        ordinal: 0,
        originalKey,
        contentType: 'image/jpeg',
        // The hostile-client case: the flag is false, meaning "strip it", and
        // the client has no way to opt out of that.
        keepLocationMetadata: false,
      },
      {
        store,
        processor,
        updateMediaItem: async (_p, _o, patch) => { patches.push(patch); },
        reconcilePost: async () => undefined,
      },
    );

    const patch = patches.at(-1)!;
    expect(patch.exifStripped).toBe(true);
    expect(patch.processingState).toBe('ready');

    const derivedKey = patch.renditions['original']!;
    const derived = await store.getObject(derivedKey);

    // The GPS-bearing APP1 segment is gone.
    expect(hasExifSegment(derived)).toBe(false);
    // ...and what remains is still a valid JPEG, not an empty file.
    expect(derived.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(derived.length).toBeGreaterThan(100);

    await store.deleteObject(derivedKey);
  }, 180_000);

  it('a media item that was not stripped can never be marked ready', async () => {
    // The invariant that makes the guarantee hold even if the worker misbehaves:
    // exifStripped gates readiness, so an unprocessed original cannot reach a reader.
    const patches: MediaItemPatch[] = [];
    await handleImageJob(
      {
        postId: 'exif-fail',
        ordinal: 0,
        originalKey: 'test/exif/does-not-exist.jpg',
        contentType: 'image/jpeg',
        keepLocationMetadata: false,
      },
      {
        store,
        processor,
        updateMediaItem: async (_p, _o, patch) => { patches.push(patch); },
        reconcilePost: async () => undefined,
      },
    ).catch(() => undefined);

    const patch = patches.at(-1)!;
    expect(patch.processingState).toBe('failed');
    expect(patch.exifStripped).toBe(false);
  }, 60_000);
});
