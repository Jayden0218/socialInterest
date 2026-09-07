import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { handleImageJob, handleVideoJob } from '@sih/workers';
import { PostRepository } from '../../persistence/post.repository';
import { EVENT_BUS, MEDIA_PROCESSOR, OBJECT_STORE, type EventBus, type MediaProcessor, type ObjectStore } from '../../ports';
import { ProcessingService } from './processing.service';
import { CONFIG, type AppConfig } from '../../config/configuration';

/**
 * Runs the media pipeline when a post is created.
 *
 * Without this, NOTHING subscribed to `post.created`. The handlers in
 * apps/workers existed and were unit-tested, `ProcessingService.reconcile`
 * existed, and no running process ever called either - so a published post stayed
 * `pending` forever and, since a pending post is visible only to its author, no
 * person could ever see another person's post. Feature 001's suites hid this by
 * invoking reconcile() by hand; the first end-to-end journey could not.
 *
 * In the `local` profile the work happens in-process. In `aws` the same handlers
 * run behind a queue - which is why they live in apps/workers and take their
 * dependencies as arguments rather than importing them.
 */
@Injectable()
export class MediaDispatchService implements OnModuleInit {
  private readonly log = new Logger(MediaDispatchService.name);

  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(OBJECT_STORE) private readonly store: ObjectStore,
    @Inject(MEDIA_PROCESSOR) private readonly processor: MediaProcessor,
    @Inject(ProcessingService) private readonly processing: ProcessingService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.media.dispatchOnCreate) {
      this.log.log('media dispatch disabled (MEDIA_DISPATCH_ON_CREATE=false)');
      return;
    }
    this.events.subscribe('post.created', async (event) => {
      const postId = event.payload['postId'] as string;
      const keepLocationMetadata = event.payload['keepLocationMetadata'] === true;
      await this.run(postId, keepLocationMetadata);
    });
  }

  async run(postId: string, keepLocationMetadata: boolean): Promise<void> {
    const media = await this.posts.listMedia(postId);
    for (const item of media) {
      if (!item.originalKey) {
        // Nothing to fetch. Leave it pending rather than letting reconcile see a
        // silent success - a media item with no source must never reach `ready`.
        this.log.error(`media item ${postId}#${item.ordinal} has no originalKey`);
        continue;
      }
      const originalKey = item.originalKey;
      try {
        if (item.kind === 'image') {
          await handleImageJob(
            {
              postId,
              ordinal: item.ordinal,
              originalKey,
              contentType: 'image/jpeg',
              keepLocationMetadata,
            },
            {
              store: this.store,
              processor: this.processor,
              // `originalKey: null` from the handler means the un-stripped
              // original was deleted; the record drops the attribute rather than
              // storing a null.
              updateMediaItem: (id, ordinal, patch) =>
                this.posts.updateMediaState(id, ordinal, {
                  ...patch,
                  originalKey: patch.originalKey ?? undefined,
                }),
              reconcilePost: async (id) => void (await this.processing.reconcile(id)),
            },
          );
        } else {
          await handleVideoJob(
            { postId, ordinal: item.ordinal, originalKey },
            {
              processor: this.processor,
              updateMediaItem: (id, ordinal, patch) => this.posts.updateMediaState(id, ordinal, patch),
              reconcilePost: async (id) => void (await this.processing.reconcile(id)),
            },
          );
        }
      } catch (err) {
        // A failed item must not leave the post half-processed and silent: the
        // media item is marked failed by the handler, and reconcile decides what
        // that means for the post. Never let it reach `ready` by omission.
        this.log.error(`media job failed for ${postId}#${item.ordinal}: ${String(err)}`);
        await this.processing.reconcile(postId);
      }
    }
  }
}
