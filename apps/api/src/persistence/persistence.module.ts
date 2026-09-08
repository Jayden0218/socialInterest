import { Global, Module, type Provider } from '@nestjs/common';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CONFIG, type AppConfig } from '../config/configuration';
import { createDocumentClient, DOC_CLIENT } from './dynamo-client';
import { PersonRepository } from './person.repository';
import { InterestRepository } from './interest.repository';
import { PersonFollowRepository } from './person-follow.repository';
import { BlockRepository } from './block.repository';
import { PostRepository } from './post.repository';
import { PostInterestIndexRepository } from './post-interest-index.repository';
import { InterestFollowRepository } from './interest-follow.repository';
import { ReactionRepository } from './reaction.repository';
import { CommentRepository } from './comment.repository';
import { ReportRepository } from './report.repository';
import { ModerationLogRepository } from './moderation-log.repository';
import { NotificationRepository } from './notification.repository';
import { UploadRepository } from './upload.repository';
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

const repo = <T>(
  cls: new (doc: DynamoDBDocumentClient, table: string) => T,
): Provider => ({
  provide: cls,
  inject: [DOC_CLIENT, CONFIG],
  useFactory: (doc: DynamoDBDocumentClient, config: AppConfig) =>
    new cls(doc, config.dynamo.tableName),
});

const providers: Provider[] = [
  { provide: DOC_CLIENT, inject: [CONFIG], useFactory: createDocumentClient },
  repo(PersonRepository),
  repo(InterestRepository),
  repo(PersonFollowRepository),
  repo(BlockRepository),
  repo(PostRepository),
  repo(PostInterestIndexRepository),
  repo(InterestFollowRepository),
  repo(ReactionRepository),
  repo(CommentRepository),
  repo(ReportRepository),
  repo(ModerationLogRepository),
  repo(NotificationRepository),
  repo(UploadRepository),
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
    DOC_CLIENT,
    PersonRepository,
    InterestRepository,
    PersonFollowRepository,
    BlockRepository,
    PostRepository,
    PostInterestIndexRepository,
    InterestFollowRepository,
    ReactionRepository,
    CommentRepository,
    ReportRepository,
    ModerationLogRepository,
    NotificationRepository,
    UploadRepository,
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
export class PersistenceModule {}
