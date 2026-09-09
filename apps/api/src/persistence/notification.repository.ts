import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';

/**
 * 008/FR-031 adds `mention`, and this is the FIFTH place a kind has to appear.
 *
 * The others are the shared enum, `describeNotification`, the preference schema
 * and the list the Edit-profile screen renders — plus a publisher, without
 * which the kind is a switch for something that cannot happen (007's `follow`).
 */
export type NotificationKind = 'reaction' | 'comment' | 'follow' | 'message' | 'mention';

export interface NotificationItem {
  notificationId: string;
  recipientId: string;
  kind: NotificationKind;
  actorId: string;
  postId?: string;
  createdAt: string;
  readAt?: string;
}

const NINETY_DAYS_SECONDS = 90 * 24 * 3600;

/** A20. TTL keeps the partition bounded without a sweep job. */
@Injectable()
export class NotificationRepository extends BaseRepository {
  async create(input: Omit<NotificationItem, 'notificationId' | 'createdAt'>): Promise<NotificationItem> {
    const item: NotificationItem = {
      ...input,
      notificationId: ulid(),
      createdAt: new Date().toISOString(),
    };
    await this.putItem({
      ...keys.notification(item.recipientId, item.createdAt, item.notificationId),
      type: 'Notification',
      ...item,
      ttl: Math.floor(Date.now() / 1000) + NINETY_DAYS_SECONDS,
    });
    return item;
  }

  async list(
    recipientId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<NotificationItem>> {
    return this.query<NotificationItem>(`USER#${recipientId}`, {
      skPrefix: SK_PREFIX.notification,
      limit: opts.limit ?? 25,
      cursor: opts.cursor ?? null,
    });
  }

  /** 008/A43. When this person last read their notifications; null if never. */
  async readWatermark(userId: string): Promise<string | null> {
    const item = await this.getItem<{ lastReadAt?: string }>(keys.notificationRead(userId));
    return item?.lastReadAt ?? null;
  }

  /**
   * 008/FR-005, FR-007. Marks everything up to `at` read, durably.
   *
   * ONE WRITE, whatever the person has accumulated, which is also what makes
   * "mark all read" free rather than a second mechanism. It affects nobody else
   * because the item lives in this person's own partition.
   */
  async markReadUpTo(userId: string, at: string): Promise<void> {
    await this.putItem({
      ...keys.notificationRead(userId),
      type: 'NotificationRead',
      lastReadAt: at,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * 008/A44, FR-006. How many notifications are newer than the watermark.
   *
   * A RANGE QUERY, not a stored counter. A count and the rows it counts are two
   * sources of truth for one fact; this one is derived and cannot disagree with
   * what the person actually has.
   *
   * BOUNDED, and it says so in its own return value. `hasMore` is not a
   * convenience - a caller that got `25` with no way to know whether that was
   * exact would either under-report or invent a "25+" the server never said.
   */
  async unreadCount(
    userId: string,
    lastReadAt: string | null,
    cap = 50,
  ): Promise<{ count: number; hasMore: boolean }> {
    const page = await this.query<NotificationItem>(`USER#${userId}`, {
      // `NOTIF#<createdAt>#<id>` sorts lexicographically by an ISO-8601 UTC
      // timestamp, so "after the watermark" is a string comparison - the same
      // comparison `deriveReadAt` makes, which is what keeps the two agreeing by
      // construction rather than by coincidence.
      ...(lastReadAt ? { skGreaterThan: `${SK_PREFIX.notification}${lastReadAt}` } : { skPrefix: SK_PREFIX.notification }),
      limit: cap + 1,
    });
    return { count: Math.min(page.items.length, cap), hasMore: page.items.length > cap };
  }
}
