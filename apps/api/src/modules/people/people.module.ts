import { Module } from '@nestjs/common';
import { PersonController } from './person.controller';
import { PersonFollowService } from './person-follow.service';
import { PostsModule } from '../posts/posts.module';

@Module({
  imports: [PostsModule],
  controllers: [PersonController],
  providers: [PersonFollowService],
  exports: [PersonFollowService],
})
export class PeopleModule {}
