import { Inject, Injectable, Logger } from '@nestjs/common';
import { PostRepository } from '../../persistence/post.repository';
import { PostService } from './post.service';
import { PostTransaction } from './post.transaction';

/**
 * A post's processingState is the aggregate of its media items' states.
 *
 * FR-009 / the data model invariant: a post is only visible to anyone but its
 * author once it is `ready`, and FR-010 gates a media item's readiness on
 * `exifStripped`. So the promotion below is the last thing standing between an
 * unprocessed original and a reader - it must never be relaxed to "most items
 * are ready" or "ready enough to show".
 */
@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(PostTransaction) private readonly tx: PostTransaction,
    @Inject(PostService) private readonly postService: PostService,
  ) {}

  async reconcile(postId: string): Promise<'pending' | 'processing' | 'ready' | 'failed'> {
    const post = await this.posts.findById(postId);
    if (!post) throw new Error(`post ${postId} not found`);
    const media = await this.posts.listMedia(postId);

    let next: 'pending' | 'processing' | 'ready' | 'failed';
    if (media.some((m) => m.processingState === 'failed')) {
      next = 'failed';
    } else if (media.length > 0 && media.every((m) => m.processingState === 'ready' && m.exifStripped)) {
      // Every item ready AND stripped. Both conditions, never one.
      next = 'ready';
    } else if (media.some((m) => m.processingState === 'processing')) {
      next = 'processing';
    } else {
      next = 'pending';
    }

    if (next !== post.processingState) {
      await this.tx.updateProcessingState({
        post,
        expandedInterestIds: this.postService.expandInterests(post.interestIds),
        processingState: next,
      });
      this.logger.log(`post ${postId}: ${post.processingState} -> ${next}`);
    }
    return next;
  }
}
