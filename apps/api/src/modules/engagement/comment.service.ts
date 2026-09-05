import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { DomainError } from '../../common/errors/problem.filter';
import { CommentRepository, type CommentItem } from '../../persistence/comment.repository';
import { PostRepository } from '../../persistence/post.repository';
import { PostQueryService } from '../posts/post-query.service';
import type { Viewer } from '../../visibility/visibility.filter';
import { EVENT_BUS, type EventBus } from '../../ports';

/**
 * FR-040. A comment is readable EXACTLY when its post is - visibility is never
 * evaluated on the comment separately, or the two could disagree and a comment
 * thread would leak the existence of a post the viewer cannot open.
 */
@Injectable()
export class CommentService {
  constructor(
    @Inject(CommentRepository) private readonly comments: CommentRepository,
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(PostQueryService) private readonly queries: PostQueryService,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  /** Gate on the POST, through the one visibility boundary. */
  private async requireReadablePost(viewer: Viewer, postId: string) {
    const result = await this.queries.getById(viewer, postId);
    if (!('post' in result)) {
      throw result.reason === 'gone'
        ? new DomainError(HttpStatus.NOT_FOUND, 'No longer available')
        : new DomainError(HttpStatus.FORBIDDEN, 'Not available to you');
    }
    return result.post;
  }

  async list(viewer: Viewer, postId: string, opts: { limit?: number; cursor?: string | null } = {}) {
    await this.requireReadablePost(viewer, postId);
    const page = await this.comments.list(postId, opts);
    return {
      items: page.items.filter((c) => !c.deletedAt),
      nextCursor: page.nextCursor,
    };
  }

  async create(viewer: { userId: string }, postId: string, body: string): Promise<CommentItem> {
    await this.requireReadablePost(viewer, postId);
    const comment: CommentItem = {
      commentId: ulid(),
      postId,
      authorId: viewer.userId,
      body,
      createdAt: new Date().toISOString(),
    };
    await this.comments.create(comment);
    await this.posts.incrementCommentCount(postId, 1);
    await this.events.publish({
      type: 'post.commented',
      payload: { postId, commentId: comment.commentId, authorId: viewer.userId },
    });
    return comment;
  }
}
