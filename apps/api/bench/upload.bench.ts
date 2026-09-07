import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { UploadService } from '../src/modules/media/upload.service';
import { OBJECT_STORE, type ObjectStore } from '../src/ports';
import { percentiles, report, timed } from './harness';

/**
 * SC-002: 95% of images under 10 MB upload within 10 seconds.
 *
 * Measures issuing the target AND transferring the bytes, because that is what
 * the criterion describes - a fast presign with a slow transfer still fails the
 * person waiting.
 */
const BUDGET_MS = 10_000;
const ITERATIONS = 20;
const SIZES_MB = [0.5, 2, 5, 10];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const uploads = app.get(UploadService);
  const store = app.get<ObjectStore>(OBJECT_STORE);

  const rows = [];
  for (const mb of SIZES_MB) {
    const body = Buffer.alloc(Math.floor(mb * 1024 * 1024), 1);
    const samples: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      samples.push(
        await timed(async () => {
          const target = await uploads.createTarget('bench-user', {
            kind: 'image',
            contentType: 'image/jpeg',
            sizeBytes: body.length,
          });
          const res = await fetch(target.url, {
            method: 'PUT',
            headers: { 'content-type': 'image/jpeg' },
            body,
          });
          if (!res.ok) throw new Error(`upload failed: ${res.status}`);
          await store.deleteObject(target.key);
        }),
      );
    }
    rows.push(percentiles(`${mb} MB image`, samples));
  }

  const ok = report('bench:upload — SC-002 image upload', BUDGET_MS, rows);
  await app.close();
  if (!ok) process.exit(1);
}

void main();
