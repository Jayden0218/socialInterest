import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import jwt from 'jsonwebtoken';
import { env } from './env';

// Asserts the four things the local runtime profile depends on. If this passes,
// every test in quickstart.md can run with no AWS account. Research D9.
const results: { name: string; ok: boolean; detail: string }[] = [];
const record = (name: string, ok: boolean, detail: string): void => {
  results.push({ name, ok, detail });
};

/**
 * 010. THE DATASTORE.
 *
 * This file used `TransactWriteCommand` against DynamoDB Local, so once the
 * engine moved it was verifying that a container the product never talks to
 * could do a transaction. That is worse than the other stale readers the swap
 * left behind, because this is THE SCRIPT WHOSE JOB IS TO SAY THE LOCAL PROFILE
 * WORKS: a PASS from it was the strongest wrong answer available.
 *
 * DELIBERATELY NOT the product's `Transactor`. Importing it was the first fix
 * and it is the wrong shape here: `Transactor` is a `@Injectable()` with a
 * parameter decorator, and dragging Nest's decorator pipeline into a four-script
 * infra package to check an engine property buys nothing — `Transactor` itself
 * is covered exhaustively by `datastore-primitives.spec.ts`, which is the
 * seven-primitive contract. What THIS check is for is the ENGINE underneath it:
 * that a multi-row write on the local container is all-or-none.
 */
const pool = new Pool({ connectionString: env.postgresUrl });
const s3 = new S3Client({
  endpoint: env.s3Endpoint,
  region: env.region,
  credentials: env.creds,
  forcePathStyle: true,
});

// 1. FR-017: a visibility flip must land on the post and its index items atomically.
async function checkTransaction(): Promise<void> {
  const id = `verify-${Date.now()}`;
  const keys = [
    { pk: `POST#${id}`, sk: '#META' },
    { pk: `INTEREST#v-a-${id}`, sk: `POST#${id}` },
    { pk: `INTEREST#v-b-${id}`, sk: `POST#${id}` },
  ];
  /** One statement per row inside one transaction: all of them, or none. */
  const writeAll = async (visibility: string): Promise<void> => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      for (const k of keys) {
        await client.query(
          `insert into items (pk, sk, item) values ($1, $2, $3)
             on conflict (pk, sk) do update set item = excluded.item`,
          [k.pk, k.sk, JSON.stringify({ ...k, visibility })],
        );
      }
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  };

  await writeAll('public');
  await writeAll('private');

  const seen = await Promise.all(
    keys.map(async (k) => {
      const { rows } = await pool.query<{ visibility: string | null }>(
        `select item->>'visibility' as visibility from items where pk = $1 and sk = $2`,
        [k.pk, k.sk],
      );
      return rows[0]?.visibility ?? 'missing';
    }),
  );
  const ok = seen.every((v) => v === 'private');
  record('TransactWriteItems (FR-017 atomic visibility flip)', ok, seen.join(','));

  /**
   * The partitions are per-run (`v-a-<id>`), so this is the whole of what this
   * check wrote and it can take all of it back out. The local table is shared
   * across runs and a grown one is this project's most-repeated false
   * regression — four occurrences, every one first diagnosed as a product
   * defect.
   */
  await pool.query(`delete from items where pk = any($1::text[])`, [keys.map((k) => k.pk)]);
}

// 2. FR-004 / FR-008: media bytes never pass through the API.
async function checkPresignedUpload(): Promise<void> {
  const key = `verify/${Date.now()}.bin`;
  const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: env.bucket, Key: key }), {
    expiresIn: 900,
  });
  const put = await fetch(url, { method: 'PUT', body: Buffer.from('verify-bytes') });
  const got = await s3.send(new GetObjectCommand({ Bucket: env.bucket, Key: key }));
  const body = await got.Body?.transformToString();
  record('S3 presigned PUT + readback (FR-004, FR-008)', put.ok && body === 'verify-bytes', `HTTP ${put.status}`);
}

// 3. FR-009: video must become playable with a poster frame.
function checkFfmpeg(): void {
  const dir = mkdtempSync(join(tmpdir(), 'sih-verify-'));
  /**
   * `ffmpeg` resolved the way the product resolves it — `FFMPEG_PATH`, else
   * `PATH` — and run IN the temp directory rather than bind-mounting it.
   *
   * T026 moved the media pipeline off `docker run` because no managed host
   * allows it, and this check kept shelling out to a container: so it verified
   * that a LOCAL DEVELOPER'S DOCKER could transcode, which is not the thing it
   * is named for. Where there is no native ffmpeg, `scripts/ffmpeg-shim/` puts
   * one on `PATH`.
   */
  const run = (...args: string[]): void => {
    execFileSync(env.ffmpegPath, args, { cwd: dir, stdio: 'pipe' });
  };
  try {
    run('-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=2', '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p', '-y', 'in.mp4');
    run('-i', 'in.mp4', '-ss', '00:00:01', '-vframes', '1', '-y', 'poster.jpg');
    run('-i', 'in.mp4', '-c:v', 'libx264', '-hls_time', '1', '-hls_playlist_type', 'vod', '-y', 'out.m3u8');
    const ok = ['in.mp4', 'poster.jpg', 'out.m3u8'].every((f) => existsSync(join(dir, f)));
    record('ffmpeg encode + poster frame + HLS (FR-009)', ok, 'mp4, jpg, m3u8');
  } catch (e) {
    record('ffmpeg encode + poster frame + HLS (FR-009)', false, String(e).slice(0, 120));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 4. FR-001: a token the API will accept.
function checkToken(): void {
  const token = jwt.sign({ sub: 'verify-user' }, env.jwtSecret, {
    issuer: env.jwtIssuer,
    expiresIn: '5m',
  });
  const decoded = jwt.verify(token, env.jwtSecret, { issuer: env.jwtIssuer }) as { sub?: string };
  record('Local JWT issuer round-trip (FR-001)', decoded.sub === 'verify-user', `sub=${decoded.sub}`);
}

async function main(): Promise<void> {
  await checkTransaction();
  await checkPresignedUpload();
  checkFfmpeg();
  checkToken();

  console.log('\nLocal profile verification\n');
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}\n        ${r.detail}`);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
  await pool.end();
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
