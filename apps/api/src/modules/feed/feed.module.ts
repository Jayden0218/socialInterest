import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { FollowExpansion } from './follow-expansion';
import { InterestFollowService } from '../interests/interest-follow.service';
import { PersonFollowService } from '../people/person-follow.service';

@Module({
  controllers: [FeedController],
  providers: [FeedService, FollowExpansion, InterestFollowService, PersonFollowService],
  exports: [FeedService, FollowExpansion, InterestFollowService, PersonFollowService],
})
export class FeedModule {}
