import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { deriveReadAt } from './read-watermark';
import { NotificationRepository, type NotificationItem } from '../../persistence/notification.repository';
import { PersonRepository } from '../../persistence/person.repository';
import { PostRepository } from '../../persistence/post.repository';
import { ConversationRepository } from '../../persistence/conversation.repository';
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
    @Inject(ConversationRepository) private readonly conversations: ConversationRepository,
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
    // 004/FR-004, FR-031. A REQUESTED conversation notifies nobody until it is
    // accepted - the request inbox withholds the notification, not the content.
    this.events.subscribe('message.created', async (e) => {
      const { conversationId, authorId } = e.payload as {
        conversationId: string;
        authorId: string;
      };
      await this.notifyOtherParticipant(conversationId, authorId);
    });
    /**
     * 007/T053. `follow` was a notification kind nothing ever produced — see
     * the note on `PersonFollowService.follow`. FR-049's preference is checked
     * here with the others, not at the publisher.
     */
    this.events.subscribe('person.followed', async (e) => {
      const { followerId, followeeId } = e.payload as { followerId: string; followeeId: string };
      await this.notifyFollowed(followeeId, followerId);
    });
  }

  /**
   * A follow notification has NO POST, so there is nothing to check visibility
   * on and nothing to draw a thumbnail from — `postThumbUrl` is null and the
   * row renders without a tile. That asymmetry is why the test asserts both
   * cases rather than only the interesting one.
   */
  private async notifyFollowed(followeeId: string, actorId: string): Promise<void> {
    if (followeeId === actorId) return; // the service refuses this anyway
    const recipient = await this.people.findById(followeeId);
    if (!recipient || recipient.status !== 'active') return;
    if (recipient.notificationPrefs.follow === false) return; // FR-049
    await this.notifications.create({ recipientId: followeeId, kind: 'follow', actorId });
  }

  /**
   * 004/FR-004.
   *
   * Every check that would normally live in the caller is here instead, for the
   * same reason the post notifications are: a second place that decides whether
   * to notify is a second place to get the preference wrong.
   */
  private async notifyOtherParticipant(conversationId: string, actorId: string): Promise<void> {
    const conversation = await this.conversations.find(conversationId);
    if (!conversation) return;
    // Not yet accepted: no notification. FR-004 is enforced here rather than at
    // the send site, so it holds however the message came to exist.
    if (conversation.state !== 'accepted') return;

    const recipientId = conversation.participantIds.find((id) => id !== actorId);
    if (!recipientId) return;
    const recipient = await this.people.findById(recipientId);
    if (!recipient || recipient.status !== 'active') return;
    if (recipient.notificationPrefs.message === false) return; // FR-031

    await this.notifications.create({ recipientId, kind: 'message', actorId });
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
    return (await this.openablePost(viewerId, postId)) !== null;
  }

  /**
   * The post this viewer may open, or null.
   *
   * `canOpen` used to throw this away and return a boolean, and 007/T053 then
   * needed the thumbnail `Activity.dc.html` shows - which was already in hand.
   * Returning it costs nothing and adds no read; collapsing it to a boolean
   * cost a second fetch that was never written.
   */
  private async openablePost(viewerId: string, postId: string): Promise<Record<string, unknown> | null> {
    return this.queries.visibleResponse({ userId: viewerId }, postId);
  }

  /** Filters a stored list, since visibility can change after generation. */
  async listVisible(
    viewerId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<{
    items: Record<string, unknown>[];
    nextCursor: string | null;
    unreadCount: number;
    unreadCapped: boolean;
  }> {
    const [page, lastReadAt] = await Promise.all([
      this.notifications.list(viewerId, opts),
      this.notifications.readWatermark(viewerId),
    ]);
    const kept: NotificationItem[] = [];
    const thumbs = new Map<string, string | null>();
    for (const n of page.items) {
      // A notification generated when the post was visible must not survive the
      // post being deleted or restricted afterwards.
      if (!n.postId) {
        kept.push(n);
        continue;
      }
      const post = await this.openablePost(viewerId, n.postId);
      if (!post) continue;
      kept.push(n);
      thumbs.set(n.postId, thumbnailOf(post));
    }
    /**
     * 008/FR-006. The count is over the WHOLE partition, not this page.
     *
     * "The true number" cannot be counted from the page the caller happened to
     * ask for - a badge that changed when you scrolled would be reporting the
     * request rather than the person's notifications.
     */
    const unread = await this.notifications.unreadCount(viewerId, lastReadAt);
    return {
      items: await this.withActors(kept, thumbs, lastReadAt),
      nextCursor: page.nextCursor,
      unreadCount: unread.count,
      unreadCapped: unread.hasMore,
    };
  }

  /**
   * 008/FR-005, FR-007. Marks everything read as of now.
   *
   * `new Date()` on the SERVER, never a client-supplied timestamp. A client that
   * sent a future one would mark notifications read before they arrived, and a
   * client with a skewed clock would do it by accident.
   *
   * Idempotent: marking twice writes the same item with a later watermark and
   * changes nothing a person can observe.
   */
  async markAllRead(viewerId: string): Promise<void> {
    await this.notifications.markReadUpTo(viewerId, new Date().toISOString());
  }

  /**
   * The contract's Notification carries an `actor` profile; the stored row
   * carries an `actorId`. Returning the row meant every client crashed reading
   * `actor.displayName`, so the notifications tab rendered nothing.
   *
   * Fifth instance of the same defect in this codebase - the feed, post detail,
   * comments, and now this - all a persistence shape escaping as a response.
   * Resolved once per distinct actor, not once per notification.
   */
  private async withActors(
    items: NotificationItem[],
    thumbs: Map<string, string | null> = new Map(),
    lastReadAt: string | null = null,
  ): Promise<Record<string, unknown>[]> {
    const ids = [...new Set(items.map((n) => n.actorId))];
    const profiles = new Map(
      (await Promise.all(ids.map((id) => this.people.findById(id)))).map((p, i) => [
        ids[i] as string,
        p,
      ]),
    );
    return items.map((n) => {
      const p = profiles.get(n.actorId);
      return {
        notificationId: n.notificationId,
        kind: n.kind,
        actor: {
          userId: n.actorId,
          handle: p?.handle ?? 'unknown',
          displayName: p?.displayName ?? 'Unknown',
        },
        postId: n.postId ?? null,
        postThumbUrl: n.postId ? (thumbs.get(n.postId) ?? null) : null,
        createdAt: n.createdAt,
        /**
         * 008/FR-005 — DERIVED, not read off the row.
         *
         * `n.readAt` was the field this returned for seven features and NOTHING
         * EVER WROTE IT, so every notification in the product was unread
         * forever. The row's own value is deliberately not consulted even as a
         * fallback: a second source for one fact is how the count and the rows
         * come to disagree.
         */
        readAt: deriveReadAt(n.createdAt, lastReadAt),
      };
    });
  }
}

/**
 * The first ready image, or a video's poster frame. Reads the RESPONSE shape
 * that `PostQueryService` produced, never a persistence row - the fifth-instance
 * defect this file's own comment records is a persistence shape escaping as a
 * response, and reaching past the query service would be the sixth.
 */
function thumbnailOf(post: Record<string, unknown>): string | null {
  const media = post.media;
  if (!Array.isArray(media)) return null;
  for (const item of media as Record<string, unknown>[]) {
    if (item.processingState !== 'ready') continue;
    if (typeof item.posterUrl === 'string') return item.posterUrl;
    const renditions = item.renditions;
    if (renditions && typeof renditions === 'object') {
      const first = Object.values(renditions as Record<string, unknown>).find((v) => typeof v === 'string');
      if (typeof first === 'string') return first;
    }
  }
  return null;
}
