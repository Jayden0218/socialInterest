import { Module } from '@nestjs/common';
import { InterestsModule } from '../interests/interests.module';
import { PeopleModule } from '../people/people.module';
import { PostsModule } from '../posts/posts.module';
import { PostSearchService } from './post-search.service';
import { SearchController } from './search.controller';

/**
 * 008/US6. `PostsModule` for `PostQueryService` — THE one responder.
 *
 * Deliberately does NOT import the ranking module. FR-021 says a search records
 * no behavioural signal, and `search-records-no-signals.spec.ts` enforces that
 * by the module being unable to reach it.
 */
@Module({
  imports: [PostsModule, PeopleModule, InterestsModule],
  controllers: [SearchController],
  providers: [PostSearchService],
  exports: [PostSearchService],
})
export class SearchModule {}
