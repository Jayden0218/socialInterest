/**
 * Configuration.
 *
 * There used to be a second `aws` profile selecting a different adapter set.
 * Spec 002 removed it: AWS is not the deployment target, and none of those
 * adapters had ever been executed. `RuntimeProfile` is kept as a single-valued
 * type rather than deleted so that adding a second profile later is a visible,
 * deliberate change rather than a string appearing in a condition.
 */
export type RuntimeProfile = 'local';

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
  media: { ffmpegImage: string; dispatchOnCreate: boolean };
}

/**
 * FR-007 (003), Principle III. The secret must be supplied, and must not be the
 * published development value.
 *
 * `dev-only-not-a-real-secret` was the built-in default and appears in this
 * repository, so anyone who has read it could mint a token the service would
 * accept. A default that is also a published constant is not a default, it is a
 * shared password.
 *
 * Refusing at BOOT rather than per-request is deliberate: a service that starts
 * and then rejects everyone is a worse failure than one that says why it will
 * not start.
 */
export const PUBLISHED_DEV_SECRET = 'dev-only-not-a-real-secret';

function requireJwtSecret(): string {
  const secret = process.env['LOCAL_JWT_SECRET'];
  if (!secret) {
    throw new Error(
      'LOCAL_JWT_SECRET is not set. It has no default: the previous default was a ' +
        'constant published in this repository, so anyone could mint a valid token. ' +
        'Generate one, e.g. `export LOCAL_JWT_SECRET=$(openssl rand -hex 32)`.',
    );
  }
  if (secret === PUBLISHED_DEV_SECRET) {
    throw new Error(
      'LOCAL_JWT_SECRET is the published development value, which is in this ' +
        'repository and therefore known to anyone who has read it. Generate a real one.',
    );
  }
  return secret;
}

export function loadConfig(): AppConfig {
  const profile = (process.env['RUNTIME_PROFILE'] ?? 'local') as RuntimeProfile;
  if (profile !== 'local') {
    throw new Error(
      `RUNTIME_PROFILE must be 'local', got '${profile}'. The aws profile was removed ` +
        'in spec 002; adding one back means registering and verifying the divergence first.',
    );
  }
  const isLocal = true;

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
      jwtSecret: requireJwtSecret(),
      issuer: str('JWT_ISSUER', 'sih-local'),
    },
    media: {
      ffmpegImage: str('FFMPEG_IMAGE', 'linuxserver/ffmpeg:latest'),
      /**
       * Run the media pipeline when a post is created. On everywhere a real
       * client talks to the API. The integration suites turn it off because they
       * drive processing explicitly to assert specific states, and an async
       * pipeline racing those assertions would be flaky by construction.
       */
      dispatchOnCreate: bool('MEDIA_DISPATCH_ON_CREATE', true),
    },
  };
}

export const CONFIG = Symbol('AppConfig');
