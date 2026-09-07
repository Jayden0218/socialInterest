import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MEDIA_PROCESSOR, OBJECT_STORE, type MediaProcessor, type ObjectStore } from '../src/ports';
import { CONFIG, type AppConfig } from '../src/config/configuration';
import { MEDIA_LIMITS } from '../src/config/media.limits';
import { percentiles, report, timed } from './harness';

/**
 * SC-003: a published video is playable within 60 seconds of the upload
 * finishing, for 95% of uploads.
 *
 * MEASURES THE FFMPEG ADAPTER ONLY. Research D9 and constitution principle V:
 * ffmpeg and MediaConvert are different implementations of the same port, not
 * emulations of one another, so a green result here is NOT evidence the AWS path
 * meets SC-003. That path is covered by docs/mediaconvert-smoke-test.md.
 *
 * The longest clip tested is the FR-005 duration cap, because the cap was chosen
 * against this budget - 180s over 60s of transcode means sustained faster than
 * 3x, and this is the number that check rests on.
 */
const BUDGET_MS = 60_000;
const DURATIONS_S = [5, 30, 60, MEDIA_LIMITS.video.maxDurationMs / 1000];
const ITERATIONS = 3;

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const config = app.get<AppConfig>(CONFIG);
  const processor = app.get<MediaProcessor>(MEDIA_PROCESSOR);
  const store = app.get<ObjectStore>(OBJECT_STORE);

  const dir = mkdtempSync(join(tmpdir(), 'sih-bench-'));
  const rows = [];

  try {
    for (const seconds of DURATIONS_S) {
      execFileSync('docker', [
        'run', '--rm', '-v', `${dir}:/w`, '-w', '/w', config.media.ffmpegImage,
        '-f', 'lavfi', '-i', `testsrc=size=1280x720:rate=30:duration=${seconds}`,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', 'src.mp4',
      ]);
      const source = readFileSync(join(dir, 'src.mp4'));
      const key = `bench/video-${seconds}s.mp4`;
      await store.putObject(key, source, 'video/mp4');

      const samples: number[] = [];
      for (let i = 0; i < ITERATIONS; i++) {
        samples.push(
          await timed(async () => {
            const job = await processor.submitVideoJob({
              sourceKey: key,
              outputPrefix: `bench/out-${seconds}-${i}`,
            });
            // Poll to completion: the criterion is upload-finished to PLAYABLE.
            for (let poll = 0; poll < 600; poll++) {
              const current = await processor.getJob(job.jobId);
              if (current.state === 'complete') return;
              if (current.state === 'failed') throw new Error(current.error ?? 'transcode failed');
              await new Promise((r) => setTimeout(r, 200));
            }
            throw new Error('transcode did not complete within the poll window');
          }),
        );
      }
      rows.push(percentiles(`${seconds}s video`, samples));
      await store.deleteObject(key);
    }

    const ok = report('bench:transcode — SC-003 (ffmpeg adapter only)', BUDGET_MS, rows);
    console.log('  NOTE: this does NOT validate the MediaConvert path (research D9).');
    console.log('  See docs/mediaconvert-smoke-test.md before launch.\n');
    await app.close();
    if (!ok) process.exit(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

void main();
