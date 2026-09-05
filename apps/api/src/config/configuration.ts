/**
 * Profile-aware configuration. Research D9: the API depends on ports for every
 * managed service except DynamoDB, and RUNTIME_PROFILE selects the adapter set.
 */
export type RuntimeProfile = 'local' | 'aws';

const str = (k: string, fallback?: string): string => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`Missing required environment variable: ${k}`);
  return v;
};
const bool = (k: string, fallback: boolean): boolean => {
  const v = process.env[k];
  return v === undefined ? fallback : v === 'true' || v === '1';
};

export interface AppConfig {
  profile: RuntimeProfile;
  port: number;
  dynamo: { endpoint?: string; region: string; tableName: string };
  objectStore: {
    endpoint?: string;
    region: string;
    bucket: string;
    forcePathStyle: boolean;
    credentials?: { accessKeyId: string; secretAccessKey: string };
  };
  identity: { jwtSecret: string; issuer: string };
  media: { ffmpegImage: string };
}

export function loadConfig(): AppConfig {
  const profile = (process.env['RUNTIME_PROFILE'] ?? 'local') as RuntimeProfile;
  if (profile !== 'local' && profile !== 'aws') {
    throw new Error(`RUNTIME_PROFILE must be 'local' or 'aws', got '${profile}'`);
  }
  const isLocal = profile === 'local';

  return {
    profile,
    port: Number(process.env['API_PORT'] ?? 3000),
    dynamo: {
      // In `aws` the SDK resolves the real endpoint; only local overrides it.
      endpoint: isLocal ? str('DYNAMO_ENDPOINT', 'http://127.0.0.1:8000') : undefined,
      region: str('DYNAMO_REGION', isLocal ? 'local' : 'us-east-1'),
      tableName: str('TABLE_NAME', 'sih-main'),
    },
    objectStore: {
      endpoint: isLocal ? str('S3_ENDPOINT', 'http://127.0.0.1:9000') : undefined,
      region: str('S3_REGION', isLocal ? 'local' : 'us-east-1'),
      bucket: str('MEDIA_BUCKET', 'sih-media'),
      forcePathStyle: bool('S3_FORCE_PATH_STYLE', isLocal),
      credentials: isLocal
        ? {
            accessKeyId: str('S3_ACCESS_KEY_ID', 'localkey'),
            secretAccessKey: str('S3_SECRET_ACCESS_KEY', 'localsecret'),
          }
        : undefined,
    },
    identity: {
      jwtSecret: str('LOCAL_JWT_SECRET', isLocal ? 'dev-only-not-a-real-secret' : ''),
      issuer: str('JWT_ISSUER', 'sih-local'),
    },
    media: { ffmpegImage: str('FFMPEG_IMAGE', 'linuxserver/ffmpeg:latest') },
  };
}

export const CONFIG = Symbol('AppConfig');
