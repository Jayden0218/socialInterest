import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module';
import { EventWaiter } from '../../common/events/event-waiter';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { MessagePollService } from './message-poll.service';
import { MessagePresenter } from './message-presenter';

/**
 * PostsModule is imported for PostQueryService, which is how a post shared into
 * a message is resolved. Not a convenience: it is the single visibility
 * boundary, and reaching for the repository directly here would be a second
 * predicate (Constitution II).
 */
@Module({
  imports: [PostsModule],
  controllers: [ConversationController],
  providers: [ConversationService, MessagePollService, MessagePresenter, EventWaiter],
  exports: [ConversationService],
})
export class ConversationsModule {}
