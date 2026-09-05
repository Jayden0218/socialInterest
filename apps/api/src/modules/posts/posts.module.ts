import { Module } from '@nestjs/common';
import { PostController } from './post.controller';
import { PostFeedsController } from './post-feeds.controller';
import { PostService } from './post.service';
import { PostQueryService } from './post-query.service';
import { PostTransaction } from './post.transaction';
import { ProcessingService } from './processing.service';
import { MediaController } from '../media/media.controller';
import { UploadService } from '../media/upload.service';

@Module({
  controllers: [PostController, PostFeedsController, MediaController],
  providers: [PostService, PostQueryService, PostTransaction, ProcessingService, UploadService],
  exports: [PostService, PostQueryService, ProcessingService],
})
export class PostsModule {}
