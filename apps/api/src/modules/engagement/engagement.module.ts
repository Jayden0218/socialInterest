import { Module } from '@nestjs/common';
import { EngagementController } from './engagement.controller';
import { ShareController } from './share.controller';
import { ReactionService } from './reaction.service';
import { CommentUpdateTransaction } from './comment-update.transaction';
import { CommentService } from './comment.service';
import { PostsModule } from '../posts/posts.module';

@Module({
  imports: [PostsModule],
  controllers: [EngagementController, ShareController],
  providers: [ReactionService, CommentService, CommentUpdateTransaction],
  exports: [ReactionService, CommentService],
})
export class EngagementModule {}
