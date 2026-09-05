import { Module } from '@nestjs/common';
import { PostController } from './post.controller';
import { PostService } from './post.service';
import { PostQueryService } from './post-query.service';
import { PostTransaction } from './post.transaction';
import { ProcessingService } from './processing.service';
import { ShareResolutionService } from './share-resolution.service';
import { MediaController } from '../media/media.controller';
import { UploadService } from '../media/upload.service';

@Module({
  controllers: [PostController, MediaController],
  providers: [PostService, PostQueryService, PostTransaction, ProcessingService, UploadService, ShareResolutionService],
  exports: [PostService, PostQueryService, ProcessingService, ShareResolutionService],
})
export class PostsModule {}
