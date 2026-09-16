import { Controller, Get, HttpStatus, Inject, Param, Query, Req } from '@nestjs/common';
import { DomainError } from '../../common/errors/problem.filter';
import type { AppRequest } from '../../common/http/request';
import { Public } from '../../common/auth/auth.guard';
import { PostQueryService } from '../posts/post-query.service';
import { CATALOGUE_SEARCH, type CatalogueSearch } from './catalogue.cache';

/**
 * FR-024, FR-025, FR-035.
 *
 * The roll-up needs no work here: PostService writes one index item per interest
 * in the expanded set (sub-interest AND parent), so querying a top-level
 * interest's partition already returns its sub-interests' posts in one Query.
 * Denormalising on write is what buys that - see data-model.md.
 *
 * Replaces the minimal listing US1 shipped in post-feeds.controller.ts, adding
 * the merged-interest redirect and a level-aware empty state.
 */
@Controller('interests')
export class InterestPostsController {
  constructor(
    @Inject(PostQueryService) private readonly queries: PostQueryService,
    @Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch,
  ) {}

  @Public()
  @Get(':interestId/posts')
  async list(
    @Req() req: AppRequest,
    @Param('interestId') interestId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('order') order?: string,
    @Query('q') q?: string,
  ) {
    const interest = this.catalogue.byId(interestId);
    if (!interest) throw new DomainError(HttpStatus.NOT_FOUND, 'No such interest');

    // FR-030: a merged interest's posts live on the survivor.
    const effectiveId =
      interest.state === 'merged' && interest.mergedIntoId ? interest.mergedIntoId : interestId;

    const page = await this.queries.listByInterest(req.viewer ?? null, effectiveId, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit))) : 20,
      cursor: cursor ?? null,
      // 004/FR-027: anything other than `top` is `new`, so a typo orders by
      // recency rather than by whatever a mis-parsed value happened to mean.
      order: order === 'top' ? 'top' : 'new',
      ...(q && q.trim() ? { q } : {}),
    });

    return {
      items: page.items,
      page: {
        // FR-035: an opaque cursor, never an offset - paging must preserve
        // position when posts are published mid-scroll.
        nextCursor: page.nextCursor,
        // 004/FR-029: "no posts here" and "nothing matched your search" are
        // different states and must not read the same.
        emptyStateHint:
          page.items.length === 0
            ? q && q.trim()
              ? 'no_search_results'
              : 'interest_has_no_posts'
            : null,
      },
      /**
       * 013/FR-021. `rollsUpFrom` IS GONE WITH THE ROLL-UP.
       *
       * 001/FR-024 made a top-level space a roll-up of its children, and this
       * field told the client where the posts had come from. Interests are flat,
       * so a space lists its own posts and nothing else — a field explaining a
       * roll-up that no longer happens would be 007's follow hint again, copy
       * describing a withdrawn requirement.
       */
      interest: {
        interestId: interest.interestId,
        name: interest.name,
      },
    };
  }
}
