import { Module } from '@nestjs/common';
import { InterestController } from './interest.controller';
import { InterestPostsController } from './interest-posts.controller';
import { InterestFollowController } from './interest-follow.controller';
import { InterestService } from './interest.service';
import { InterestSearch } from './catalogue.search';
import { HierarchyValidator } from './hierarchy.validator';
import { NamePolicy } from './name-policy';
import { PostsModule } from '../posts/posts.module';
import { FeedModule } from '../feed/feed.module';

@Module({
  imports: [PostsModule, FeedModule],
  controllers: [InterestController, InterestPostsController, InterestFollowController],
  providers: [InterestService, InterestSearch, HierarchyValidator, NamePolicy],
  exports: [InterestService, InterestSearch, NamePolicy, HierarchyValidator],
})
export class InterestsHttpModule {}
