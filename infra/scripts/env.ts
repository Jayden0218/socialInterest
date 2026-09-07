import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Minimal .env loader - avoids a dependency for four scripts.
export function loadEnv(): void {
  for (const f of ['.env.local', '.env']) {
    const p = resolve(process.cwd(), '..', f);
    const q = resolve(process.cwd(), f);
    const path = existsSync(q) ? q : existsSync(p) ? p : null;
    if (!path) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  }
}

loadEnv();

export const env = {
  tableName: process.env.TABLE_NAME ?? 'sih-main',
  bucket: process.env.MEDIA_BUCKET ?? 'sih-media',
  dynamoEndpoint: process.env.DYNAMO_ENDPOINT ?? 'http://127.0.0.1:8000',
  s3Endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
  region: process.env.DYNAMO_REGION ?? 'local',
  creds: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'localkey',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'localsecret',
  },
  jwtSecret: process.env.LOCAL_JWT_SECRET ?? '',
  jwtIssuer: process.env.JWT_ISSUER ?? 'sih-local',
  ffmpegImage: process.env.FFMPEG_IMAGE ?? 'linuxserver/ffmpeg:latest',
};
