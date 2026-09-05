import { execFileSync } from 'node:child_process';

/**
 * T011. Real media bytes, not placeholders.
 *
 * The GPS JPEG matters: feature 001 discovered its EXIF fixture was never
 * actually tagged, so the strip assertion had been passing vacuously. A fixture
 * that does not carry the thing under test makes the test a no-op, and a green
 * no-op is worse than a missing test.
 */

/** Minimal 1x1 JPEG. */
const JPEG_1X1 = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

/**
 * A JPEG carrying a real EXIF APP1 segment with GPS tags. Built by splicing the
 * segment in after SOI rather than asking a muxer to add it - ffmpeg's mjpeg
 * muxer silently drops `-metadata`, which is how 001's fixture ended up untagged.
 */
export function jpegWithGps(): Buffer {
  const exif = buildExifApp1WithGps();
  return Buffer.concat([JPEG_1X1.subarray(0, 2), exif, JPEG_1X1.subarray(2)]);
}

export function jpegPlain(): Buffer {
  return JPEG_1X1;
}

/** A short real MP4, produced by the ffmpeg container (no host ffmpeg needed). */
export function mp4Short(seconds = 1): Buffer {
  const image = process.env['FFMPEG_IMAGE'] ?? 'linuxserver/ffmpeg:latest';
  const out = execFileSync(
    'docker',
    [
      'run', '--rm', '-i', '--entrypoint', 'ffmpeg', image,
      '-f', 'lavfi', '-i', `testsrc=size=64x64:rate=10:duration=${seconds}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', 'frag_keyframe+empty_moov',
      '-f', 'mp4', 'pipe:1',
    ],
    { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return Buffer.from(out);
}

function buildExifApp1WithGps(): Buffer {
  // TIFF header (little-endian) + IFD0 with one entry pointing at a GPS IFD.
  const parts: Buffer[] = [];
  const tiff = Buffer.alloc(8);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4); // IFD0 at offset 8
  parts.push(tiff);

  const ifd0 = Buffer.alloc(2 + 12 + 4);
  ifd0.writeUInt16LE(1, 0); // one entry
  ifd0.writeUInt16LE(0x8825, 2); // GPSInfoIFDPointer
  ifd0.writeUInt16LE(4, 4); // LONG
  ifd0.writeUInt32LE(1, 6);
  ifd0.writeUInt32LE(8 + ifd0.length, 10); // GPS IFD offset
  ifd0.writeUInt32LE(0, 14); // no next IFD
  parts.push(ifd0);

  // GPS IFD: latitude ref + latitude (3 rationals).
  const gpsEntries = 2;
  const gpsIfdLen = 2 + gpsEntries * 12 + 4;
  const gpsIfd = Buffer.alloc(gpsIfdLen);
  gpsIfd.writeUInt16LE(gpsEntries, 0);
  // GPSLatitudeRef = 'N'
  gpsIfd.writeUInt16LE(0x0001, 2);
  gpsIfd.writeUInt16LE(2, 4); // ASCII
  gpsIfd.writeUInt32LE(2, 6);
  gpsIfd.write('N\0', 10, 'ascii');
  // GPSLatitude = 3 RATIONALs, stored out-of-line
  const latOffset = 8 + ifd0.length + gpsIfdLen;
  gpsIfd.writeUInt16LE(0x0002, 14);
  gpsIfd.writeUInt16LE(5, 16); // RATIONAL
  gpsIfd.writeUInt32LE(3, 18);
  gpsIfd.writeUInt32LE(latOffset, 22);
  gpsIfd.writeUInt32LE(0, 26);
  parts.push(gpsIfd);

  const lat = Buffer.alloc(24);
  [[51, 1], [30, 1], [0, 1]].forEach(([num, den], i) => {
    lat.writeUInt32LE(num as number, i * 8);
    lat.writeUInt32LE(den as number, i * 8 + 4);
  });
  parts.push(lat);

  const tiffBlock = Buffer.concat(parts);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiffBlock]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}
