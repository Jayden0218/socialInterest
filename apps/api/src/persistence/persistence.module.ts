import { Global, Inject, Module, type OnModuleDestroy, type Provider } from '@nestjs/common';
import type { Pool } from 'pg';
import { CONFIG, type AppConfig } from '../config/configuration';
import { createPool, PG_POOL } from './pg-pool';
import { Transactor } from './transactor';
import { PersonRepository } from './person.repository';
import { HandleClaimRepository } from './handle-claim.repository';
import { CredentialRepository } from './credential.repository';
import { InterestRepository } from './interest.repository';
import { PersonFollowRepository } from './person-follow.repository';
import { BlockRepository } from './block.repository';
import { PostRepository } from './post.repository';
import { PostInterestIndexRepository } from './post-interest-index.repository';
import { PostTermIndexRepository } from './post-term-index.repository';
import { InterestFollowRepository } from './interest-follow.repository';
import { ReactionRepository } from './reaction.repository';
import { CommentRepository } from './comment.repository';
import { ReportRepository } from './report.repository';
import { ModerationLogRepository } from './moderation-log.repository';
import { NotificationRepository } from './notification.repository';
import { UploadRepository } from './upload.repository';
import { DraftRepository } from './draft.repository';
import { MuteRepository } from './mute.repository';
import { DismissalRepository } from './dismissal.repository';
import { AppealRepository } from './appeal.repository';
import { CollectionRepository } from './collection.repository';
import { EventRepository } from './event.repository';
// feature 004
import { ConversationRepository } from './conversation.repository';
import { MessageRepository } from './message.repository';
import { PlaceRepository } from './place.repository';
import { RatingRepository } from './rating.repository';
import { PlaceFollowRepository } from './place-follow.repository';
import { PostPlaceIndexRepository } from './post-place-index.repository';
import { SavedPostRepository } from './saved-post.repository';
// feature 007
import { SignalRepository } from './signal.repository';

const repo = <T>(cls: new (pool: Pool, table: string) => T): Provider => ({
  provide: cls,
  inject: [PG_POOL, CONFIG],
  useFactory: (pool: Pool, config: AppConfig) => new cls(pool, config.dynamo.tableName),
});

const providers: Provider[] = [
  { provide: PG_POOL, inject: [CONFIG], useFactory: createPool },
  // 010. The one place a multi-item write is executed — see ./transactor.ts.
  Transactor,
  repo(PersonRepository),
  repo(HandleClaimRepository),
  repo(CredentialRepository),
  repo(InterestRepository),
  repo(PersonFollowRepository),
  repo(BlockRepository),
  repo(PostRepository),
  repo(PostInterestIndexRepository),
  repo(PostTermIndexRepository),
  repo(InterestFollowRepository),
  repo(ReactionRepository),
  repo(CommentRepository),
  repo(ReportRepository),
  repo(ModerationLogRepository),
  repo(NotificationRepository),
  repo(UploadRepository),
  // feature 008
  repo(DraftRepository),
  repo(MuteRepository),
  repo(DismissalRepository),
  repo(AppealRepository),
  repo(CollectionRepository),
  repo(EventRepository),
  repo(ConversationRepository),
  repo(MessageRepository),
  repo(PlaceRepository),
  repo(PlaceFollowRepository),
  repo(PostPlaceIndexRepository),
  repo(SavedPostRepository),
  // feature 005
  repo(RatingRepository),
  // feature 007
  repo(SignalRepository),
];

@Global()
@Module({
  providers,
  exports: [
    PG_POOL,
    Transactor,
    PersonRepository,
    HandleClaimRepository,
    CredentialRepository,
    InterestRepository,
    PersonFollowRepository,
    BlockRepository,
    PostRepository,
    PostInterestIndexRepository,
    PostTermIndexRepository,
    InterestFollowRepository,
    ReactionRepository,
    CommentRepository,
    ReportRepository,
    ModerationLogRepository,
    NotificationRepository,
    UploadRepository,
    // feature 008
    DraftRepository,
    MuteRepository,
    DismissalRepository,
    AppealRepository,
    CollectionRepository,
    EventRepository,
    ConversationRepository,
    MessageRepository,
    PlaceRepository,
    RatingRepository,
    PlaceFollowRepository,
    PostPlaceIndexRepository,
    SavedPostRepository,
    SignalRepository,
  ],
})
export class PersistenceModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * 010. THE POOL IS CLOSED WHEN THE MODULE IS.
   *
   * The old engine spoke HTTP and had nothing to leak; a connection pool does.
   * Without this, every test suite that boots the application leaves eight
   * connections open, and Postgres starts refusing with "sorry, too many
   * clients already" — which surfaced as 224 failures across 31 suites and
   * looks exactly like a broken datastore rather than an unclosed handle.
   *
   * It matters beyond the suite: a process that restarts its Nest application
   * leaks the same way, and the free managed tier this is going to has a
   * connection ceiling low enough to reach.
   */
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
