import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { NotificationRepository, type NotificationItem } from '../../persistence/notification.repository';
import { PersonRepository } from '../../persistence/person.repository';
import { PostRepository } from '../../persistence/post.repository';
import { PostQueryService } from '../posts/post-query.service';
import { EVENT_BUS, type EventBus } from '../../ports';

/**
 * FR-048 and FR-049.
 *
 * A notification is generated only when BOTH hold:
 *   1. the recipient has that category enabled (FR-049), and
 *   2. the recipient can actually open the post it refers to.
 *
 * The second check is the one that is easy to omit. FR-018 lists notifications
 * as a surface visibility must hold on, and a notification is a read path like
 * any other: "X commented on your post" about a post the recipient can no longer
 * open would leak its existence through the one surface nobody thinks to filter.
 */
@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(NotificationRepository) private readonly notifications: NotificationRepository,
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(PostQueryService) private readonly queries: PostQueryService,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  onModuleInit(): void {
    this.events.subscribe('post.reacted', async (e) => {
      const { postId, userId } = e.payload as { postId: string; userId: string };
      await this.notifyPostAuthor(postId, 'reaction', userId);
    });
    this.events.subscribe('post.commented', async (e) => {
      const { postId, authorId } = e.payload as { postId: string; authorId: string };
      await this.notifyPostAuthor(postId, 'comment', authorId);
    });
  }

  private async notifyPostAuthor(
    postId: string,
    kind: 'reaction' | 'comment',
    actorId: string,
  ): Promise<void> {
    const post = await this.posts.findById(postId);
    if (!post || post.authorId === actorId) return; // no self-notifications

    const recipient = await this.people.findById(post.authorId);
    if (!recipient || recipient.status !== 'active') return;
    if (recipient.notificationPrefs[kind] === false) return; // FR-049

    // FR-048 + FR-018: only if the recipient can open it.
    if (!(await this.canOpen(recipient.userId, postId))) return;

    await this.notifications.create({ recipientId: recipient.userId, kind, actorId, postId });
  }

  async canOpen(viewerId: string, postId: string): Promise<boolean> {
    const result = await this.queries.getById({ userId: viewerId }, postId);
    return 'post' in result;
  }

  /** Filters a stored list, since visibility can change after generation. */
  async listVisible(
    viewerId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ items: NotificationItem[]; nextCursor: string | null }> {
    const page = await this.notifications.list(viewerId, opts);
    const kept: NotificationItem[] = [];
    for (const n of page.items) {
      // A notification generated when the post was visible must not survive the
      // post being deleted or restricted afterwards.
      if (!n.postId || (await this.canOpen(viewerId, n.postId))) kept.push(n);
    }
    return { items: kept, nextCursor: page.nextCursor };
  }
}
