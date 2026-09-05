import { Controller, Get, HttpStatus, Inject, Param, Query, Req } from '@nestjs/common';
import { DomainError } from '../../common/errors/problem.filter';
import type { AppRequest } from '../../common/http/request';
import { Public } from '../../common/auth/auth.guard';
import { PersonRepository } from '../../persistence/person.repository';
import { PostQueryService } from './post-query.service';

/**
 * The two read surfaces US1 needs for its acceptance scenario: a published post
 * must be visible in its interest's space and on the author's profile.
 *
 * Both go through PostQueryService, so both go through VisibilityFilter. US2
 * (T079) extends the interest listing with sub-interest listing and empty-state
 * hints; US4 (T109) extends the profile with counts and top interests.
 *
 * FR-024 roll-up already works here: an index item is written per interest in
 * the expanded set, so querying a parent's partition returns its sub-interests'
 * posts without a second query.
 */
@Controller()
export class PostFeedsController {
  constructor(
    @Inject(PostQueryService) private readonly queries: PostQueryService,
    @Inject(PersonRepository) private readonly people: PersonRepository,
  ) {}

  @Public()
  @Get('interests/:interestId/posts')
  async byInterest(
    @Req() req: AppRequest,
    @Param('interestId') interestId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const page = await this.queries.listByInterest(req.viewer ?? null, interestId, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit))) : 20,
      cursor: cursor ?? null,
    });
    return {
      items: page.items,
      page: {
        nextCursor: page.nextCursor,
        emptyStateHint: page.items.length === 0 ? 'interest_has_no_posts' : null,
      },
    };
  }

  @Public()
  @Get('people/:handle/posts')
  async byAuthor(
    @Req() req: AppRequest,
    @Param('handle') handle: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const person = await this.people.findByHandle(handle);
    if (!person) throw new DomainError(HttpStatus.NOT_FOUND, 'No such person');
    const page = await this.queries.listByAuthor(req.viewer ?? null, person.userId, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit))) : 20,
      cursor: cursor ?? null,
    });
    return {
      items: page.items,
      page: {
        nextCursor: page.nextCursor,
        emptyStateHint: page.items.length === 0 ? 'no_posts_yet' : null,
      },
    };
  }
}
