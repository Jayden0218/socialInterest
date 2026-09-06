import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';

export type NotificationKind = 'reaction' | 'comment' | 'follow' | 'message';

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
}
