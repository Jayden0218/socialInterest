import type { Notification } from '@sih/shared';
import type { DataClient } from './client';

export interface NotificationPage {
  items: Notification[];
  nextCursor?: string;
}

export class NotificationsData {
  constructor(private readonly client: DataClient) {}

  list(opts: { limit?: number; cursor?: string } = {}): Promise<NotificationPage> {
    return this.client.call<NotificationPage>('getNotifications', {
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }
}
