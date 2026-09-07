import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { AppRequest } from '../../common/http/request';
import { FeedService } from './feed.service';

/**
 * FR-032, FR-035, FR-036. SC-005 sets this endpoint's latency budget: first
 * content within 2s at p95.
 */
@Controller('feed')
export class FeedController {
  constructor(@Inject(FeedService) private readonly feed: FeedService) {}

  @Get('home')
  async home(@Req() req: AppRequest, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const page = await this.feed.homeFeed(req.viewer!, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit))) : 20,
      cursor: cursor ?? null,
    });
    return {
      items: page.items,
      page: { nextCursor: page.nextCursor, emptyStateHint: page.emptyStateHint },
      // Diagnostic, not product data: bench:feed correlates p95 against this,
      // since research D1 accepts that latency scales with follow count.
      meta: { fanOutWidth: page.fanOutWidth },
    };
  }
}
