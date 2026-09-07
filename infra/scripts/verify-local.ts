import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
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

const doc = DynamoDBDocumentClient.from(
  new DynamoDBClient({ endpoint: env.dynamoEndpoint, region: env.region, credentials: env.creds }),
);
const s3 = new S3Client({
  endpoint: env.s3Endpoint,
  region: env.region,
  credentials: env.creds,
  forcePathStyle: true,
});

// 1. FR-017: a visibility flip must land on the post and its index items atomically.
async function checkTransaction(): Promise<void> {
  const id = `verify-${Date.now()}`;
  const items = (visibility: string) => [
    { Put: { TableName: env.tableName, Item: { pk: `POST#${id}`, sk: '#META', visibility } } },
    { Put: { TableName: env.tableName, Item: { pk: `INTEREST#v-sub`, sk: `POST#${id}`, visibility } } },
    { Put: { TableName: env.tableName, Item: { pk: `INTEREST#v-parent`, sk: `POST#${id}`, visibility } } },
  ];
  await doc.send(new TransactWriteCommand({ TransactItems: items('public') }));
  await doc.send(new TransactWriteCommand({ TransactItems: items('private') }));
  const seen = await Promise.all(
    [`POST#${id}`, 'INTEREST#v-sub', 'INTEREST#v-parent'].map((pk) =>
      doc.send(
        new QueryCommand({
          TableName: env.tableName,
          KeyConditionExpression: 'pk = :p',
          ExpressionAttributeValues: { ':p': pk },
        }),
      ),
    ),
  );
  const vis = seen.map((r) => r.Items?.find((i) => i['pk'])?.['visibility']);
  const ok = vis.every((v) => v === 'private');
  record('DynamoDB TransactWriteItems (FR-017 atomic visibility flip)', ok, vis.join(','));
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
  const run = (...args: string[]): void => {
    execFileSync('docker', ['run', '--rm', '-v', `${dir}:/w`, '-w', '/w', env.ffmpegImage, ...args], {
      stdio: 'pipe',
    });
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
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
