import { Module } from '@nestjs/common';
import { PostController } from './post.controller';
import { PostService } from './post.service';
import { PostQueryService } from './post-query.service';
import { PostTransaction } from './post.transaction';
import { PostUpdateTransaction } from './post-update.transaction';
import { ProcessingService } from './processing.service';
import { ShareResolutionService } from './share-resolution.service';
import { MediaDispatchService } from './media-dispatch.service';
import { MediaController } from '../media/media.controller';
import { UploadService } from '../media/upload.service';

@Module({
  controllers: [PostController, MediaController],
  providers: [PostService, PostQueryService, PostTransaction, PostUpdateTransaction, ProcessingService, UploadService, ShareResolutionService, MediaDispatchService],
  exports: [PostService, PostQueryService, ProcessingService, ShareResolutionService],
})
export class PostsModule {}
