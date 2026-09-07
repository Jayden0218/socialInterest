import { Inject, Injectable } from '@nestjs/common';
import { PostQueryService } from '../posts/post-query.service';
import { PostRepository } from '../../persistence/post.repository';
import type { MessageItem } from '../../persistence/message.repository';
import type { Viewer } from '../../visibility/visibility.filter';

/**
 * Turns stored messages into what a reader is allowed to see.
 *
 * TWO DECISIONS, NOT ONE. ConversationAccess decided the reader may see the
 * THREAD. Whether they may see a post shared INSIDE it is a separate question,
 * answered per reader by VisibilityFilter, at read time - which is why
 * `sharedPostId` is stored as a reference and never as a snapshot. A
 * denormalised caption or thumbnail here would be a materialised copy that
 * outlives a visibility change, and Constitution II forbids introducing one
 * without amending it first.
 *
 * This is surface 10 of the visibility matrix.
 */
@Injectable()
export class MessagePresenter {
  constructor(
    @Inject(PostQueryService) private readonly posts: PostQueryService,
    @Inject(PostRepository) private readonly postRepo: PostRepository,
  ) {}

  async present(viewer: Viewer, messages: MessageItem[]): Promise<Record<string, unknown>[]> {
    return Promise.all(messages.map((m) => this.one(viewer, m)));
  }

  private async one(viewer: Viewer, message: MessageItem): Promise<Record<string, unknown>> {
    const base = {
      messageId: message.messageId,
      authorId: message.authorId,
      // Moderation removes CONTENT. The message stays in the thread, because
      // silently deleting it is indistinguishable from a bug to both people.
      body: message.moderationState === 'removed' ? null : message.body,
      createdAt: message.createdAt,
      moderationState: message.moderationState,
      sharedPostId: message.sharedPostId,
    };

    if (!message.sharedPostId || message.moderationState === 'removed') {
      return { ...base, sharedPost: null, sharedPostUnavailableReason: null };
    }

    const result = await this.posts.getById(viewer, message.sharedPostId);
    if (!('post' in result)) {
      return {
        ...base,
        sharedPost: null,
        // 001's error distinction, reused rather than reinvented: "gone" and
        // "not for you" are different messages to a reader, and a block reads as
        // "gone" so it is not disclosed.
        sharedPostUnavailableReason: result.reason === 'gone' ? 'gone' : 'not-for-you',
      };
    }

    return {
      ...base,
      /**
       * The FULL response shape, hydrated - not VisibilityFilter's candidate
       * rows. That defect has shipped five times in this repository: the feed,
       * post detail, both comment paths, notifications and a person's own
       * profile all returned index or candidate rows as responses. The filter
       * decides WHAT is visible; it was never the shape of what to send.
       */
      sharedPost: await this.posts.toResponse(result.post, await this.postRepo.listMedia(result.post.postId)),
      sharedPostUnavailableReason: null,
    };
  }
}
