import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { FollowingFeedService } from './following-feed.service';

import { InterestFollowService } from '../interests/interest-follow.service';
import { PersonFollowService } from '../people/person-follow.service';
import { PostsModule } from '../posts/posts.module';
import { RankingModule } from '../ranking/ranking.module';

/**
 * PostsModule is imported for PostQueryService - the ONE responder. The feed
 * used to build its own post shape and drifted from the contract; see the note
 * in feed.service.ts.
 */
@Module({
  imports: [PostsModule, RankingModule],
  controllers: [FeedController],
  providers: [FeedService, FollowingFeedService, InterestFollowService, PersonFollowService],
  exports: [FeedService, FollowingFeedService, InterestFollowService, PersonFollowService],
})
export class FeedModule {}
