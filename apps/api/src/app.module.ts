import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdaptersModule } from './adapters/adapters.module';
import { PersistenceModule } from './persistence/persistence.module';
import { VisibilityModule } from './visibility/visibility.module';
import { ConversationAccessModule } from './conversations/conversation-access.module';
import { InterestsModule } from './modules/interests/interests.module';
import { InterestsHttpModule } from './modules/interests/interests-http.module';
import { FeedModule } from './modules/feed/feed.module';
import { PeopleModule } from './modules/people/people.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { SafetyModule } from './modules/safety/safety.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PostsModule } from './modules/posts/posts.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { PlacesModule } from './modules/places/places.module';
import { AuthGuard } from './common/auth/auth.guard';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard';
import { LoggerMiddleware } from './common/logging/logger.middleware';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [
    AdaptersModule,
    PersistenceModule,
    VisibilityModule,
    ConversationAccessModule,
    InterestsModule,
    PostsModule,
    InterestsHttpModule,
    FeedModule,
    PeopleModule,
    EngagementModule,
    SafetyModule,
    ModerationModule,
    NotificationsModule,
    ConversationsModule,
    PlacesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Auth runs before rate limiting so the limiter keys on the person, not the IP.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggerMiddleware).forRoutes('{*path}');
  }
}
