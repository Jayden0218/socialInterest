#!/usr/bin/env node
/**
 * Produces apps/e2e/fixtures/sample.mp4 - a real, short H.264 video.
 *
 * 001/FR-005 and 001/FR-009 have been declared complete twice and have never once
 * been exercised, because there was no video to publish. The journey created an
 * upload target and asserted a state string. This is the file that turns that into
 * an actual upload, transcode, and poster frame.
 *
 * ffmpeg comes from the linuxserver/ffmpeg CONTAINER. `apt-get install ffmpeg`
 * fails here - the Debian repos are blocked by egress policy.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const out = 'apps/e2e/fixtures/sample.mp4';
mkdirSync(resolve(root, 'apps/e2e/fixtures'), { recursive: true });

if (existsSync(resolve(root, out)) && !process.argv.includes('--force')) {
  console.log(`${out} already exists (${statSync(resolve(root, out)).size} bytes) - pass --force to rebuild`);
  process.exit(0);
}

// 3s, 320x240, 15fps: small enough to commit, long enough for a poster frame to
// be a real decision rather than the only frame there is.
execFileSync(
  'docker',
  [
    'run', '--rm', '-v', `${root}:/work`, '-w', '/work', '--entrypoint', 'ffmpeg',
    'linuxserver/ffmpeg',
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=3',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
    '-c:a', 'aac', '-shortest',
    '-movflags', '+faststart',
    out,
  ],
  { stdio: ['ignore', 'inherit', 'inherit'] },
);

const size = statSync(resolve(root, out)).size;
if (size < 1024) throw new Error(`${out} is ${size} bytes - that is not a video`);
console.log(`wrote ${out} (${size} bytes)`);
