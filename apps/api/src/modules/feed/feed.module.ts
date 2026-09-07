import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { FollowExpansion } from './follow-expansion';
import { InterestFollowService } from '../interests/interest-follow.service';
import { PersonFollowService } from '../people/person-follow.service';
import { PostsModule } from '../posts/posts.module';

/**
 * PostsModule is imported for PostQueryService - the ONE responder. The feed
 * used to build its own post shape and drifted from the contract; see the note
 * in feed.service.ts.
 */
@Module({
  imports: [PostsModule],
  controllers: [FeedController],
  providers: [FeedService, FollowExpansion, InterestFollowService, PersonFollowService],
  exports: [FeedService, FollowExpansion, InterestFollowService, PersonFollowService],
})
export class FeedModule {}
