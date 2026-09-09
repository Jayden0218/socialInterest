import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { AppRequest } from '../../common/http/request';
import { FeedService } from './feed.service';
import { FollowingFeedService } from './following-feed.service';

/**
 * FR-032, FR-035, FR-036. SC-005 sets this endpoint's latency budget: first
 * content within 2s at p95.
 */
@Controller('feed')
export class FeedController {
  constructor(
    @Inject(FeedService) private readonly feed: FeedService,
    @Inject(FollowingFeedService) private readonly followingFeed: FollowingFeedService,
  ) {}

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

  /**
   * 008/US3, FR-008 — CHRONOLOGICAL, UNRANKED, SIGNAL-FREE.
   *
   * A separate endpoint rather than a mode on `/feed/home`, deliberately. A
   * `?ranked=false` parameter would put two selection strategies behind one
   * route, and the guard that proves this surface cannot reach the ranker
   * (`following-feed-is-unranked.spec.ts`) works by the service being unable to
   * import it — which a shared service would defeat.
   */
  @Get('following')
  async following(@Req() req: AppRequest, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const page = await this.followingFeed.page(req.viewer!, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit))) : 20,
      cursor: cursor ?? null,
    });
    return {
      items: page.items,
      // `nextCursor` NESTED under `page`, like every other list endpoint. 007
      // found `ApiPage<T>` declaring it at the top level while every endpoint
      // nested it, so no list in the app ever loaded a second page.
      page: { nextCursor: page.nextCursor, emptyStateHint: page.emptyStateHint },
    };
  }
}
