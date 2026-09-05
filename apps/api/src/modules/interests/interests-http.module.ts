import { Module } from '@nestjs/common';
import { InterestController } from './interest.controller';
import { InterestPostsController } from './interest-posts.controller';
import { InterestService } from './interest.service';
import { InterestSearch } from './catalogue.search';
import { HierarchyValidator } from './hierarchy.validator';
import { NamePolicy } from './name-policy';
import { PostsModule } from '../posts/posts.module';

@Module({
  imports: [PostsModule],
  controllers: [InterestController, InterestPostsController],
  providers: [InterestService, InterestSearch, HierarchyValidator, NamePolicy],
  exports: [InterestService, InterestSearch, NamePolicy, HierarchyValidator],
})
export class InterestsHttpModule {}
