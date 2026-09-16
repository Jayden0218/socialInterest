/**
 * Shared local-profile settings. Mirrors infra/scripts/env.ts defaults.
 *
 * `dynamoEndpoint`, `region` and `creds` were removed with the last reader of
 * them (010). They were an AWS endpoint, an AWS region and an AWS key pair for
 * an engine the product no longer speaks to, sitting in the file a reader
 * copies from — and the durability suite's broken read is what they would have
 * been re-wired to. A name that does not exist is a typecheck failure the
 * moment somebody writes it again; 006 made that argument for the theme shim
 * and it is the same one here.
 */
export const e2eEnv = {
  tableName: process.env['TABLE_NAME'] ?? 'sih-main',
  bucket: process.env['MEDIA_BUCKET'] ?? 'sih-media',
  /** 010. The datastore. Local default only; the hosted one sets DATABASE_URL. */
  postgresUrl: process.env['DATABASE_URL'] ?? 'postgres://sih:localsecret@127.0.0.1:5432/sih',
  s3Endpoint: process.env['S3_ENDPOINT'] ?? 'http://127.0.0.1:9000',
  get jwtSecret(): string {
    // A getter, not a snapshot: global-setup generates this, and a value read at
    // module load would be captured before that runs.
    const s = process.env['LOCAL_JWT_SECRET'];
    if (!s) throw new Error('LOCAL_JWT_SECRET is not set - global setup did not run');
    return s;
  },
  jwtIssuer: process.env['JWT_ISSUER'] ?? 'sih-local',
};
