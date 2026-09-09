import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { DomainError } from '../../common/errors/problem.filter';
import { CommentRepository, type CommentItem } from '../../persistence/comment.repository';
import { PostRepository } from '../../persistence/post.repository';
import { PersonRepository } from '../../persistence/person.repository';
import { PostQueryService } from '../posts/post-query.service';
import { ProfileProjection } from '../people/profile.projection';
import type { Viewer } from '../../visibility/visibility.filter';
import { EVENT_BUS, type EventBus } from '../../ports';
import { groupWithParents, validReplyParent } from './reply-parent';

/**
 * The response shape, named rather than `Record<string, unknown>`.
 *
 * `groupWithParents` needs `commentId` and `parentCommentId` to be more than
 * "some key that might be there" — and a named shape is what stops the seventh
 * instance of this codebase's oldest defect, a persistence row escaping as a
 * response.
 */
export interface CommentResponse {
  commentId: string;
  author: unknown;
  body: string | null;
  moderationState: 'removed' | null;
  parentCommentId: string | null;
  createdAt: string;
}

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
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(EVENT_BUS) private readonly events: EventBus,
    @Inject(ProfileProjection) private readonly profiles: ProfileProjection,
  ) {}

  /**
   * The contract's Comment carries an `author` profile; the stored row carries
   * an `authorId`. Returning the row meant every client crashed reading
   * `author.displayName`, and a comment thread rendered as nothing at all.
   *
   * Same defect as the post detail endpoint and, before that, the feed: a
   * persistence shape escaping as a response. Authors are resolved once per
   * distinct id rather than once per comment, so a thread of fifty comments
   * from three people costs three reads.
   */
  private async withAuthors(items: CommentItem[]): Promise<CommentResponse[]> {
    const ids = [...new Set(items.map((c) => c.authorId))];
    const profiles = new Map(
      (await Promise.all(ids.map((id) => this.people.findById(id)))).map((p, i) => [
        ids[i] as string,
        p,
      ]),
    );
    return Promise.all(
      items.map(async (c) => ({
        commentId: c.commentId,
        // 008/US5. One projection, so a comment author has a face too.
        author: await this.profiles.fromPerson(c.authorId, profiles.get(c.authorId) ?? null),
        /**
         * 008/FR-026. A removed comment keeps its ROW and loses its BODY.
         *
         * `null` rather than a placeholder sentence, so the client decides how
         * to say it and no two surfaces can word it differently. The row stays
         * because deleting it would take the thread's shape with it and leave
         * every reply an orphan — which reads as a bug to the people who wrote
         * them.
         */
        body: c.moderationState === 'removed' ? null : c.body,
        moderationState: c.moderationState ?? null,
        parentCommentId: c.parentCommentId ?? null,
        createdAt: c.createdAt,
      })),
    );
  }

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
    /**
     * 008/FR-024. Grouped AFTER the author hydration and BEFORE the response,
     * so the ordering rule sees exactly what the client will.
     */
    const visible = page.items.filter((c) => !c.deletedAt);
    return {
      items: groupWithParents(await this.withAuthors(visible)),
      nextCursor: page.nextCursor,
    };
  }

  /** Returns the contract shape, not the stored row - see withAuthors. */
  async create(
    viewer: { userId: string },
    postId: string,
    body: string,
    parentCommentId?: string | null,
  ): Promise<CommentResponse> {
    await this.requireReadablePost(viewer, postId);
    /**
     * 008/FR-023, FR-025. The parent is resolved against THIS POST's comments.
     *
     * The rows are read even when no parent was named — one Query, the same one
     * the listing does — because a reply that named a parent on another post
     * must be refused rather than stored, and a reply-to-a-reply must be
     * re-parented rather than rejected.
     */
    let parent: string | null = null;
    if (parentCommentId) {
      const existing = await this.comments.list(postId, { limit: 200 });
      const decision = validReplyParent(
        existing.items.map((c) => ({
          commentId: c.commentId,
          postId: c.postId,
          parentCommentId: c.parentCommentId ?? null,
        })),
        postId,
        parentCommentId,
      );
      if (!decision.ok) {
        throw new DomainError(HttpStatus.BAD_REQUEST, 'That comment is not on this post');
      }
      parent = decision.parentCommentId;
    }
    const comment: CommentItem = {
      commentId: ulid(),
      postId,
      authorId: viewer.userId,
      body,
      parentCommentId: parent,
      createdAt: new Date().toISOString(),
    };
    await this.comments.create(comment);
    await this.posts.incrementCommentCount(postId, 1);
    await this.events.publish({
      type: 'post.commented',
      payload: { postId, commentId: comment.commentId, authorId: viewer.userId },
    });
    return (await this.withAuthors([comment]))[0]!;
  }
}
