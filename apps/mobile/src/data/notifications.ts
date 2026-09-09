import type { Notification } from '@sih/shared';
import type { DataClient } from './client';

export interface NotificationPage {
  items: Notification[];
  /**
   * THE CONTRACT'S SHAPE, and it was WRONG here until 007.
   *
   * Every list endpoint answers `{ items, page: { nextCursor, ... } }`. This
   * declared `nextCursor` at the TOP LEVEL, so `usePaged` read `undefined`,
   * concluded the list was exhausted, and the app COULD NEVER LOAD A SECOND
   * PAGE — of the feed, an interest space, a profile, comments or
   * notifications. Since the first page always arrived, every screen looked
   * correct.
   *
   * Nothing caught it because every mobile test stubs this type, so the stubs
   * were wrong in exactly the same way the code was: they agreed with each
   * other and neither agreed with the server. Only a request could find it, and
   * `apps/e2e` now makes one that asks for page two.
   */
  page: {
    nextCursor: string | null;
    emptyStateHint?: string | null;
    /**
     * 008/FR-006. Notifications newer than the read watermark, over the whole
     * partition rather than this page.
     *
     * Optional, because a server that has not shipped 008 yet will not send it,
     * and a client that assumed otherwise would render `NaN` in a badge. That is
     * not defensive habit - the field above it exists as a comment about exactly
     * this shape being got wrong.
     */
    unreadCount?: number;
    /** True when `unreadCount` is a floor, so a client can render "50+" honestly. */
    unreadCapped?: boolean;
  };
}

export class NotificationsData {
  constructor(private readonly client: DataClient) {}

  list(opts: { limit?: number; cursor?: string } = {}): Promise<NotificationPage> {
    return this.client.call<NotificationPage>('getNotifications', {
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }

  /**
   * 008/FR-005, FR-007. Marks every notification read.
   *
   * `readAt` has been declared on every notification and returned to every
   * client since 001 with nothing writing it, so this is the half that was
   * missing rather than a new feature.
   */
  markAllRead(): Promise<void> {
    return this.client.call<void>('putNotificationsRead', {});
  }
}
