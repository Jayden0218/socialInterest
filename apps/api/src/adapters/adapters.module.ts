import { Global, Module, type Provider } from '@nestjs/common';
import { CONFIG, loadConfig, type AppConfig } from '../config/configuration';
import {
  EVENT_BUS,
  IDENTITY_PROVIDER,
  MEDIA_PROCESSOR,
  OBJECT_STORE,
  type ObjectStore,
} from '../ports';
import { MinioObjectStore } from './local/minio-object-store';
import { FfmpegMediaProcessor } from './local/ffmpeg-media-processor';
import { LocalIdentityProvider } from './local/local-identity-provider';
import { InProcessEventBus } from './local/in-process-event-bus';
import { S3ObjectStore } from './aws/s3-object-store';
import { MediaConvertMediaProcessor } from './aws/mediaconvert-media-processor';
import { CognitoIdentityProvider } from './aws/cognito-identity-provider';

/**
 * Adapter selection (research D9). The `local` set needs no AWS account; the
 * `aws` set is a deferred placeholder and nothing in tasks.md provisions it.
 *
 * DynamoDB deliberately has no entry here - DynamoDB Local speaks the same API,
 * so the persistence layer is identical in both profiles.
 */
const providers: Provider[] = [
  { provide: CONFIG, useFactory: loadConfig },
  {
    provide: OBJECT_STORE,
    inject: [CONFIG],
    useFactory: (config: AppConfig) =>
      config.profile === 'aws' ? new S3ObjectStore(config) : new MinioObjectStore(config),
  },
  {
    provide: MEDIA_PROCESSOR,
    inject: [CONFIG, OBJECT_STORE],
    useFactory: (config: AppConfig, store: ObjectStore) =>
      config.profile === 'aws'
        ? new MediaConvertMediaProcessor()
        : new FfmpegMediaProcessor(config, store),
  },
  {
    provide: IDENTITY_PROVIDER,
    inject: [CONFIG],
    useFactory: (config: AppConfig) =>
      config.profile === 'aws' ? new CognitoIdentityProvider() : new LocalIdentityProvider(config),
  },
  { provide: EVENT_BUS, useClass: InProcessEventBus },
];

@Global()
@Module({ providers, exports: providers.map((p) => (p as { provide: symbol }).provide) })
export class AdaptersModule {}
