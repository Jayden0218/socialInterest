/** Shared local-profile settings. Mirrors infra/scripts/env.ts defaults. */
export const e2eEnv = {
  tableName: process.env['TABLE_NAME'] ?? 'sih-main',
  bucket: process.env['MEDIA_BUCKET'] ?? 'sih-media',
  dynamoEndpoint: process.env['DYNAMO_ENDPOINT'] ?? 'http://127.0.0.1:8000',
  s3Endpoint: process.env['S3_ENDPOINT'] ?? 'http://127.0.0.1:9000',
  region: process.env['DYNAMO_REGION'] ?? 'local',
  creds: {
    accessKeyId: process.env['S3_ACCESS_KEY_ID'] ?? 'localkey',
    secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'] ?? 'localsecret',
  },
  get jwtSecret(): string {
    // A getter, not a snapshot: global-setup generates this, and a value read at
    // module load would be captured before that runs.
    const s = process.env['LOCAL_JWT_SECRET'];
    if (!s) throw new Error('LOCAL_JWT_SECRET is not set - global setup did not run');
    return s;
  },
  jwtIssuer: process.env['JWT_ISSUER'] ?? 'sih-local',
};
