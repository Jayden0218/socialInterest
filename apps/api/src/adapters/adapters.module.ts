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

/**
 * One implementation per port.
 *
 * There used to be a second, `aws` set - S3, MediaConvert, Cognito, CloudFront -
 * selected by RUNTIME_PROFILE. It was removed in spec 002 when the owner decided
 * AWS is not the deployment target. Every one of those adapters had never been
 * executed, so keeping them would have left four untested implementations behind
 * a profile switch, which is how a defect hides.
 *
 * The ports remain. They are still worth having: they keep the media pipeline and
 * the identity check out of the modules that use them, and they are where a second
 * implementation would go if a managed service is ever adopted. If that happens,
 * Principle V applies again and the divergence must be registered and verified
 * before launch - see specs/002-production-readiness/research.md R4.
 *
 * DynamoDB deliberately has no entry here: DynamoDB Local speaks the same API, so
 * no adapter is warranted (research 001/D9).
 */
const providers: Provider[] = [
  { provide: CONFIG, useFactory: loadConfig },
  {
    provide: OBJECT_STORE,
    inject: [CONFIG],
    useFactory: (config: AppConfig) => new MinioObjectStore(config),
  },
  {
    provide: MEDIA_PROCESSOR,
    inject: [CONFIG, OBJECT_STORE],
    useFactory: (config: AppConfig, store: ObjectStore) => new FfmpegMediaProcessor(config, store),
  },
  {
    provide: IDENTITY_PROVIDER,
    inject: [CONFIG],
    useFactory: (config: AppConfig) => new LocalIdentityProvider(config),
  },
  { provide: EVENT_BUS, useClass: InProcessEventBus },
];

@Global()
@Module({ providers, exports: providers.map((p) => (p as { provide: symbol }).provide) })
export class AdaptersModule {}
