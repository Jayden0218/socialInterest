import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module';
import { SavedController } from './saved.controller';
import { SavedService } from './saved.service';
import { CollectionService } from './collection.service';

@Module({
  imports: [PostsModule],
  controllers: [SavedController],
  providers: [SavedService, CollectionService],
  exports: [SavedService, CollectionService],
})
export class SavedModule {}
