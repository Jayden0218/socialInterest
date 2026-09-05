import { Module } from '@nestjs/common';
import { PersonController } from './person.controller';
import { MeController } from './me.controller';
import { PersonFollowService } from './person-follow.service';
import { AccountDeletionService } from './account-deletion.service';
import { PostsModule } from '../posts/posts.module';

@Module({
  imports: [PostsModule],
  controllers: [MeController, PersonController],
  providers: [PersonFollowService, AccountDeletionService],
  exports: [PersonFollowService, AccountDeletionService],
})
export class PeopleModule {}
