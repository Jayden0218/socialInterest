/**
 * Fails unless a screenshot shows something.
 *
 * The only Android capture in this project's history is entirely black - taken
 * while the emulator was crashlooping and the app was not installed. It was
 * filed as evidence anyway. A blank capture proves nothing and must fail the
 * run (003/FR-002, contract android-journey-run.md).
 *
 * PNG is decoded here rather than with a library: the CI job has no npm install
 * step at this point, and zlib is in the standard library. Only the two formats
 * `adb exec-out screencap -p` produces are handled - 8-bit RGB and RGBA - and
 * anything else is a hard failure rather than a silent pass, because a check
 * that cannot read the image must not report that the image is fine.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const path = process.argv[2];
if (!path) {
  console.error('usage: assert-screen-not-blank.mjs <file.png>');
  process.exit(2);
}

const buf = readFileSync(path);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_MAGIC)) {
  console.error(`FAIL: ${path} is not a PNG (${buf.length} bytes)`);
  process.exit(1);
}

let width = 0, height = 0, bitDepth = 0, colorType = 0;
const idat = [];
for (let off = 8; off + 8 <= buf.length; ) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString('ascii', off + 4, off + 8);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
    if (data[12] !== 0) {
      console.error('FAIL: interlaced PNG is not supported by this check');
      process.exit(1);
    }
  } else if (type === 'IDAT') {
    idat.push(data);
  } else if (type === 'IEND') break;
  off += 12 + len;
}

if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
  console.error(`FAIL: unsupported PNG (bitDepth=${bitDepth} colorType=${colorType})`);
  process.exit(1);
}

const channels = colorType === 6 ? 4 : 3;
const stride = width * channels;
const raw = inflateSync(Buffer.concat(idat));
if (raw.length < height * (stride + 1)) {
  console.error(`FAIL: truncated image data (${raw.length} bytes for ${width}x${height})`);
  process.exit(1);
}

// Undo the per-scanline filters. Without this the "pixels" are deltas, and an
// all-black image and a real one can both look varied.
const out = Buffer.alloc(height * stride);
const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)];
  const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
  for (let x = 0; x < stride; x++) {
    const a = x >= channels ? out[y * stride + x - channels] : 0;
    const b = y > 0 ? out[(y - 1) * stride + x] : 0;
    const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
    let v = line[x];
    if (filter === 1) v += a;
    else if (filter === 2) v += b;
    else if (filter === 3) v += (a + b) >> 1;
    else if (filter === 4) v += paeth(a, b, c);
    else if (filter !== 0) {
      console.error(`FAIL: unknown PNG filter ${filter} on row ${y}`);
      process.exit(1);
    }
    out[y * stride + x] = v & 0xff;
  }
}

// Distinct colours, and how much of the image the commonest one occupies.
// Either alone is foolable: a two-colour image is not a rendered screen, and a
// screen that is 99.9% one colour with a stray pixel is still blank.
const counts = new Map();
for (let i = 0; i < height * stride; i += channels) {
  const key = (out[i] << 16) | (out[i + 1] << 8) | out[i + 2];
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
const pixels = width * height;
let dominant = 0;
for (const n of counts.values()) if (n > dominant) dominant = n;
const dominantPct = (dominant / pixels) * 100;

console.log(
  `${path}: ${width}x${height}, ${counts.size} distinct colours, ` +
    `commonest covers ${dominantPct.toFixed(2)}%`,
);

// Thresholds chosen against what a real screen looks like, not tuned to pass.
// A rendered app screen has hundreds of colours (text antialiasing alone) and no
// single colour covering nearly everything. A black screen has ONE colour at
// 100%, which is the case that has actually occurred here.
const MIN_COLOURS = 16;
const MAX_DOMINANT_PCT = 98;
if (counts.size < MIN_COLOURS || dominantPct > MAX_DOMINANT_PCT) {
  console.error(
    `FAIL: ${path} is blank or near-blank ` +
      `(needs >= ${MIN_COLOURS} colours and commonest <= ${MAX_DOMINANT_PCT}%).`,
  );
  console.error('A blank capture is not evidence. Do not file it as a passing run.');
  process.exit(1);
}
console.log('OK: the capture shows a rendered screen.');
