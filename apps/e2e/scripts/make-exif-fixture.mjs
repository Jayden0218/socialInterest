#!/usr/bin/env node
/**
 * Produces apps/e2e/fixtures/with-gps.jpg - a JPEG carrying REAL EXIF GPS tags.
 *
 * SC-008 asserts that publishing media with embedded coordinates attaches no place
 * and suggests none (004/FR-021), and that 001/FR-010's strip actually removes them.
 * Both assertions are worthless against a file that never had coordinates in it, so
 * this writes the APP1/TIFF/GPS-IFD structure by hand rather than trusting a library
 * that may or may not have written what it claimed.
 *
 * The base image comes from the linuxserver/ffmpeg container; the EXIF is injected
 * here, in pure Node, so the byte layout is inspectable in this file.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const fixtures = resolve(root, 'apps/e2e/fixtures');
mkdirSync(fixtures, { recursive: true });

const bare = resolve(fixtures, '.bare.jpg');
const out = resolve(fixtures, 'with-gps.jpg');

if (existsSync(out) && !process.argv.includes('--force')) {
  console.log('apps/e2e/fixtures/with-gps.jpg already exists - pass --force to rebuild');
  process.exit(0);
}

execFileSync(
  'docker',
  [
    'run', '--rm', '-v', `${root}:/work`, '-w', '/work', '--entrypoint', 'ffmpeg',
    'linuxserver/ffmpeg', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=1:duration=1',
    '-frames:v', '1', 'apps/e2e/fixtures/.bare.jpg',
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);

/** The coordinates the test looks for. Deliberately somewhere real and specific. */
export const GPS = { latDeg: 1, latMin: 17, latSec: 22, latRef: 'N', lonDeg: 103, lonMin: 51, lonSec: 2, lonRef: 'E' };

const be32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const be16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const rational = (num, den) => Buffer.concat([be32(num), be32(den)]);

/** tag, type, count, and either 4 inline bytes or a 4-byte offset. */
const entry = (tag, type, count, valueOrOffset) =>
  Buffer.concat([be16(tag), be16(type), be32(count), valueOrOffset]);

const TYPE = { BYTE: 1, ASCII: 2, LONG: 4, RATIONAL: 5 };

// TIFF offsets are measured from the start of the TIFF header ("MM..").
//   0   TIFF header (8 bytes)
//   8   IFD0: count(2) + 1 entry(12) + next(4) = 18 -> ends at 26
//   26  GPS IFD: count(2) + 5 entries(60) + next(4) = 66 -> ends at 92
//   92  GPSLatitude  (3 rationals, 24 bytes)
//   116 GPSLongitude (3 rationals, 24 bytes) -> total 140
const GPS_IFD_OFFSET = 26;
const LAT_DATA_OFFSET = 92;
const LON_DATA_OFFSET = 116;

const tiffHeader = Buffer.concat([Buffer.from('MM'), be16(0x2a), be32(8)]);

const ifd0 = Buffer.concat([
  be16(1),
  entry(0x8825, TYPE.LONG, 1, be32(GPS_IFD_OFFSET)), // GPSInfoIFDPointer
  be32(0),
]);

const gpsIfd = Buffer.concat([
  be16(5),
  entry(0x0000, TYPE.BYTE, 4, Buffer.from([2, 3, 0, 0])), // GPSVersionID 2.3.0.0
  entry(0x0001, TYPE.ASCII, 2, Buffer.from(`${GPS.latRef}\0\0\0`, 'latin1')),
  entry(0x0002, TYPE.RATIONAL, 3, be32(LAT_DATA_OFFSET)),
  entry(0x0003, TYPE.ASCII, 2, Buffer.from(`${GPS.lonRef}\0\0\0`, 'latin1')),
  entry(0x0004, TYPE.RATIONAL, 3, be32(LON_DATA_OFFSET)),
  be32(0),
]);

const latData = Buffer.concat([rational(GPS.latDeg, 1), rational(GPS.latMin, 1), rational(GPS.latSec, 1)]);
const lonData = Buffer.concat([rational(GPS.lonDeg, 1), rational(GPS.lonMin, 1), rational(GPS.lonSec, 1)]);

const tiff = Buffer.concat([tiffHeader, ifd0, gpsIfd, latData, lonData]);
if (tiff.length !== 140) throw new Error(`TIFF block is ${tiff.length} bytes, expected 140 - offsets above are wrong`);

const exifPayload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), be16(exifPayload.length + 2), exifPayload]);

const jpeg = readFileSync(bare);
if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('base file is not a JPEG');
writeFileSync(out, Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]));

// Read it straight back, the way a stripper would have to, so this script cannot
// claim to have written coordinates it did not write.
const check = readFileSync(out);
const marker = check.indexOf(Buffer.from([0xff, 0xe1]));
if (marker !== 2) throw new Error(`APP1 is at ${marker}, expected 2`);
if (check.subarray(marker + 4, marker + 10).toString('latin1') !== 'Exif\0\0') throw new Error('APP1 is not an Exif segment');
const t = marker + 10;
if (check.readUInt32BE(t + GPS_IFD_OFFSET + 2 + 12 * 2 + 8) !== LAT_DATA_OFFSET) throw new Error('GPSLatitude offset did not survive the write');
if (check.readUInt32BE(t + LAT_DATA_OFFSET) !== GPS.latDeg) throw new Error('GPSLatitude degrees did not survive the write');

console.log(
  `wrote apps/e2e/fixtures/with-gps.jpg (${check.length} bytes) with GPS ` +
    `${GPS.latDeg}°${GPS.latMin}'${GPS.latSec}"${GPS.latRef} ${GPS.lonDeg}°${GPS.lonMin}'${GPS.lonSec}"${GPS.lonRef}`,
);
