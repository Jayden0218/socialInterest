import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module';
import { SavedController } from './saved.controller';
import { SavedService } from './saved.service';

@Module({
  imports: [PostsModule],
  controllers: [SavedController],
  providers: [SavedService],
  exports: [SavedService],
})
export class SavedModule {}
