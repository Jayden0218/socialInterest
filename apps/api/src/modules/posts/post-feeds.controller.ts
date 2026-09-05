import { Controller, Get, HttpStatus, Inject, Param, Query, Req } from '@nestjs/common';
import { DomainError } from '../../common/errors/problem.filter';
import type { AppRequest } from '../../common/http/request';
import { Public } from '../../common/auth/auth.guard';
import { PersonRepository } from '../../persistence/person.repository';
import { PostQueryService } from './post-query.service';

/**
 * The profile post surface. Goes through PostQueryService, so it goes through
 * VisibilityFilter. US4 (T109) extends it with counts and top interests.
 *
 * The interest-space listing that US1 shipped here has moved to
 * InterestPostsController, which adds the merged-interest redirect and
 * roll-up reporting. One owner per surface.
 */
@Controller()
export class PostFeedsController {
  constructor(
    @Inject(PostQueryService) private readonly queries: PostQueryService,
    @Inject(PersonRepository) private readonly people: PersonRepository,
  ) {}

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
