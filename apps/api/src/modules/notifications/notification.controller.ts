import { Controller, Get, HttpCode, HttpStatus, Inject, Put, Query, Req } from '@nestjs/common';
import type { AppRequest } from '../../common/http/request';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(@Inject(NotificationService) private readonly notifications: NotificationService) {}

  /** FR-048. Filtered through the same visibility rules as every other surface. */
  @Get()
  async list(@Req() req: AppRequest, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const page = await this.notifications.listVisible(req.viewer!.userId, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit))) : 25,
      cursor: cursor ?? null,
    });
    return {
      items: page.items,
      /**
       * 008/FR-006. Beside the cursor, NOT at the top level.
       *
       * `nextCursor` is nested under `page` and `unreadCount` joins it there,
       * because 007 found `ApiPage<T>` declaring the cursor at the TOP level
       * while every endpoint nested it - so `usePaged` read `undefined`, marked
       * every list exhausted, and no list in the app ever loaded a second page.
       * Five features of green tests, because every mobile test stubbed the data
       * layer and the stubs were wrong in exactly the same way the type was.
       */
      page: {
        nextCursor: page.nextCursor,
        emptyStateHint: page.items.length === 0 ? 'no_results' : null,
        unreadCount: page.unreadCount,
        // Says the count is a floor, so a client can render "50+" without
        // inventing a threshold the server never mentioned.
        unreadCapped: page.unreadCapped,
      },
    };
  }

  /**
   * 008/FR-005, FR-007 — GIVE `readAt` A WRITER.
   *
   * A PUT, not a POST: setting a watermark to "now" is idempotent, and a retry
   * after a dropped response must not be a second, different event.
   *
   * It is deliberately NOT done inside `GET /notifications`. Writing on read
   * would mutate N rows on a hot path and give a GET side effects, which breaks
   * retry and caching for every client.
   */
  @Put('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(@Req() req: AppRequest): Promise<void> {
    await this.notifications.markAllRead(req.viewer!.userId);
  }
}
