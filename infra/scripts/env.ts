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
  /**
   * 010. The engine the datastore is moving to.
   *
   * A default for the LOCAL stack only, matching docker-compose.yml. The hosted
   * deployment supplies DATABASE_URL from its environment and never from here -
   * FR-016, and a guard fails the build if a credential-shaped string appears
   * anywhere in this tree.
   */
  postgresUrl: process.env.DATABASE_URL ?? 'postgres://sih:localsecret@127.0.0.1:5432/sih',
  s3Endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
  /** Object storage's region. Named for the SDK that demands one, not for AWS. */
  region: process.env.S3_REGION ?? process.env.DYNAMO_REGION ?? 'local',
  creds: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'localkey',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'localsecret',
  },
  jwtSecret: process.env.LOCAL_JWT_SECRET ?? '',
  jwtIssuer: process.env.JWT_ISSUER ?? 'sih-local',
  /**
   * The BINARY, not an image. T026 moved the product off `docker run`; this
   * stayed behind pointing at a container, so `verify:local` was checking that
   * a developer's Docker could transcode rather than that the thing the API
   * executes can. `scripts/ffmpeg-shim/` is what supplies it where there is no
   * native one.
   */
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
};
