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
  jwtSecret: process.env['LOCAL_JWT_SECRET'] ?? 'dev-only-not-a-real-secret',
  jwtIssuer: process.env['JWT_ISSUER'] ?? 'sih-local',
};
