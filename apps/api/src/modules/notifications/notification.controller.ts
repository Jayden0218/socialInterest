import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
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
      page: { nextCursor: page.nextCursor, emptyStateHint: page.items.length === 0 ? 'no_results' : null },
    };
  }
}
