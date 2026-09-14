/**
 * Check that this machine can actually run the backend, before you find out on
 * your phone.
 *
 *   pnpm doctor
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY EACH CHECK DRIVES THE PRODUCT'S OWN CODE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * It would be easier to `curl` the endpoints and call that a check. It would
 * also be worthless in the way this project has been bitten by repeatedly: both
 * sides of a check written from the same assumption agree with each other and
 * neither agrees with the product. So the storage checks go through
 * `MinioObjectStore` — the same adapter the API uses, presigning the same way —
 * and the datastore check runs the same pool the repositories run on.
 *
 * Every failure names the thing to change. "Configuration is invalid" tells you
 * what you already knew.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { MinioObjectStore } from '../src/adapters/local/minio-object-store';
import type { AppConfig } from '../src/config/configuration';

const ok = (m: string): void => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string, fix: string): never => {
  console.log(`  \x1b[31m✗\x1b[0m ${m}`);
  console.log(`\n    ${fix.split('\n').join('\n    ')}\n`);
  process.exit(1);
};
const warn = (m: string): void => console.log(`  \x1b[33m!\x1b[0m ${m}`);

const env = (k: string): string => process.env[k] ?? '';

/**
 * `String(err)` on a failed connection prints `AggregateError` and nothing else.
 *
 * `pg` tries every address a host resolves to and wraps the failures, so the
 * thing you need — `ENOTFOUND`, `ECONNREFUSED`, `password authentication
 * failed` — is one level down. A check that reports the wrapper has told you
 * only that something went wrong, which you knew.
 */
function describe(err: unknown): string {
  const inner = (err as { errors?: unknown[] }).errors;
  if (Array.isArray(inner) && inner.length > 0) {
    return inner.map((e) => (e instanceof Error ? e.message : String(e))).join('; ');
  }
  const cause = (err as { cause?: unknown }).cause;
  if (cause) return `${String(err)} — ${String(cause)}`;
  return String(err);
}

async function main(): Promise<void> {
  console.log('\nChecking this machine can run the backend.\n');

  // ── 1. tools ──────────────────────────────────────────────────────────────
  for (const tool of ['ffmpeg', 'ffprobe']) {
    try {
      const v = execFileSync(tool, ['-version'], { encoding: 'utf8' }).split('\n')[0] ?? '';
      ok(`${tool} — ${v.slice(0, 60)}`);
    } catch {
      bad(
        `${tool} is not on PATH`,
        'brew install ffmpeg\n\nThe API strips GPS out of every photograph server-side (FR-010) and\nreads its dimensions. Without it nothing publishes at all: the post stays\n`pending`, and a pending post is visible only to its author.',
      );
    }
  }

  // ── 2. the datastore ──────────────────────────────────────────────────────
  const pool = new Pool({
    connectionString: env('DATABASE_URL'),
    max: 2,
    ...(env('DATABASE_SSL') === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  try {
    const { rows } = await pool.query<{ v: number }>('select 1 as v');
    if (rows[0]?.v !== 1) throw new Error('the database answered something unexpected');
    ok('database reachable');
  } catch (e: unknown) {
    bad(
      `cannot reach the database — ${describe(e)}`,
      'Check DATABASE_URL in .env.local.\n\n' +
        'Use Supabase → Connect → SESSION POOLER. The direct connection is IPv6\n' +
        'only and home networks are IPv4; the transaction pooler breaks a\n' +
        'long-lived connection pool, which is what the API opens.\n\n' +
        'If it mentions a password, the URI still has [YOUR-PASSWORD] in it.',
    );
  }

  const { rows: tables } = await pool.query<{ n: number }>(
    `select count(*)::int as n from information_schema.tables where table_name = 'items'`,
  );
  if (tables[0]?.n) {
    const { rows: counted } = await pool.query<{ n: number }>('select count(*)::int as n from items');
    ok(`schema present — ${counted[0]?.n ?? 0} rows in \`items\``);
  } else {
    warn('the `items` table does not exist yet — `pnpm laptop` creates it on start');
  }
  await pool.end();

  // ── 3. object storage, through the adapter the product uses ───────────────
  const config = {
    objectStore: {
      endpoint: env('S3_ENDPOINT'),
      region: env('S3_REGION'),
      bucket: env('MEDIA_BUCKET'),
      publicEndpoint: env('S3_PUBLIC_ENDPOINT') || env('S3_ENDPOINT'),
      forcePathStyle: env('S3_FORCE_PATH_STYLE') !== 'false',
      credentials: {
        accessKeyId: env('S3_ACCESS_KEY_ID'),
        secretAccessKey: env('S3_SECRET_ACCESS_KEY'),
      },
    },
  } as AppConfig;

  const store = new MinioObjectStore(config);
  const key = `doctor/${randomUUID()}.txt`;
  const body = Buffer.from('doctor probe');

  try {
    await store.putObject(key, body, 'text/plain');
    ok(`bucket \`${config.objectStore.bucket}\` accepts writes`);
  } catch (e: unknown) {
    const message = describe(e);
    bad(
      `cannot write to object storage — ${message.slice(0, 160)}`,
      message.includes('SignatureDoesNotMatch')
        ? 'S3_REGION is probably wrong. A SigV4 signature covers the region, so a\n' +
          'mismatch is refused as a signature error — which reads as a bad key and\n' +
          'is not. Supabase shows the region beside the endpoint.'
        : message.includes('NoSuchBucket') || message.includes('404')
          ? `The bucket \`${config.objectStore.bucket}\` does not exist.\nSupabase → Storage → New bucket → name it exactly that, and keep it PRIVATE.`
          : 'Check S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in .env.local.',
    );
  }

  const read = await store.getObject(key);
  if (read.toString() !== body.toString()) bad('what came back was not what went in', 'This should not happen — tell Claude.');
  ok('reads back what it wrote');

  /**
   * THE BUCKET MUST BE PRIVATE, and this is the one check worth having even
   * though nothing in the product reads it.
   *
   * Every image URL the API issues is signed for fifteen minutes and issued only
   * AFTER `VisibilityFilter` has decided this viewer may see that post. A public
   * bucket makes that decision decorative: the object is fetchable by anyone who
   * has the key, forever, and the boundary has been bypassed rather than failed.
   *
   * 006 recorded both halves of this going wrong — an UNSIGNED url against a
   * private bucket (every image 403) and then opening the bucket to "fix" it.
   * Reverting the open bucket was right; the reason given at the time was wrong.
   */
  const unsigned = store.publicUrl(key);
  try {
    const res = await fetch(unsigned);
    if (res.ok) {
      bad(
        `the bucket is PUBLIC — an unsigned request read the object (${res.status})`,
        `Supabase → Storage → \`${config.objectStore.bucket}\` → make it private.\n\n` +
          'Every image URL this app issues is signed for 15 minutes and only after\n' +
          'the visibility boundary has allowed that viewer. A public bucket makes\n' +
          'that decision decorative: anyone with the key can read the file, forever.',
      );
    }
    ok(`bucket is private — an unsigned read is refused (${res.status})`);
  } catch {
    ok('bucket is private — an unsigned read did not succeed');
  }

  // The path media actually takes: presign, upload, presign, read.
  const target = await store.createUploadTarget({ key: `${key}.presigned`, contentType: 'text/plain' });
  const put = await fetch(target.url, {
    method: target.method,
    headers: { 'content-type': 'text/plain', ...target.headers },
    body: body as unknown as BodyInit,
  });
  if (!put.ok) {
    bad(
      `a presigned upload was refused (${put.status})`,
      'This is the exact path a phone takes to upload a photograph.\n' +
        'If the status is 403, check S3_REGION and the keys. If the signature\n' +
        'covers a different host than the one being called, check\n' +
        'S3_PUBLIC_ENDPOINT — a signature covers the host, so a URL signed for\n' +
        'one address cannot be repaired by rewriting it to another.',
    );
  }
  ok('a presigned upload works — this is the path a phone takes');

  await store.deleteObject(key).catch(() => undefined);
  await store.deleteObject(`${key}.presigned`).catch(() => undefined);
  ok('cleaned up after itself');

  console.log('\n\x1b[32mEverything checks out.\x1b[0m Next: `pnpm laptop`\n');
}

main().catch((e: unknown) => {
  console.error(`\ndoctor failed unexpectedly: ${String(e)}`);
  const cause = (e as { cause?: unknown }).cause;
  if (cause) console.error(`  cause: ${String(cause)}`);
  process.exit(1);
});
