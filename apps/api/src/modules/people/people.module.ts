import { Module } from '@nestjs/common';
import { PersonController } from './person.controller';
import { MeController } from './me.controller';
import { PersonSearchService } from './person-search.service';
import { PersonFollowService } from './person-follow.service';
import { AccountDeletionService } from './account-deletion.service';
import { PostsModule } from '../posts/posts.module';

@Module({
  imports: [PostsModule],
  controllers: [MeController, PersonController],
  providers: [PersonFollowService, AccountDeletionService, PersonSearchService],
  // 008/US6. `SearchController` reuses people search for FR-022's fallback
  // rather than reimplementing it - two people searches would be two chances
  // for the block filter to be applied differently.
  exports: [PersonFollowService, AccountDeletionService, PersonSearchService],
})
export class PeopleModule {}
