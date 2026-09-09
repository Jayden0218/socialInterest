import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import type { AppRequest } from '../../common/http/request';
import { CATALOGUE_SEARCH, type CatalogueSearch } from '../interests/catalogue.cache';
import { PersonSearchService } from '../people/person-search.service';
import { ProfileProjection } from '../people/profile.projection';
import { PostSearchService } from './post-search.service';

/**
 * 008/US6 — POST TEXT SEARCH (FR-020, FR-021, FR-022).
 *
 * An ADDITIONAL surface, never a replacement. Constitution Principle I requires
 * the interest surfaces to stay complete and reachable, and `GET /v1/interests`
 * and `GET /v1/people` are untouched — which is also what FR-022's fallback
 * depends on.
 */
@Controller('search')
export class SearchController {
  constructor(
    @Inject(PostSearchService) private readonly posts: PostSearchService,
    @Inject(PersonSearchService) private readonly people: PersonSearchService,
    @Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch,
    @Inject(ProfileProjection) private readonly profiles: ProfileProjection,
  ) {}

  @Get('posts')
  async searchPosts(
    @Req() req: AppRequest,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const query = (q ?? '').trim();
    const page = await this.posts.search(req.viewer!, query, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit))) : 20,
      cursor: cursor ?? null,
    });

    /**
     * FR-022 — A MISS OFFERS INTERESTS AND PEOPLE, IN THE SAME RESPONSE.
     *
     * In the same response rather than behind a second request, so a client
     * renders the fallback without a round trip and cannot show an empty screen
     * while it waits. Computed ONLY when there is nothing to show, so the common
     * case pays nothing for it.
     */
    const fallback =
      page.items.length === 0 && query.length > 0
        ? {
            interests: this.catalogue.search(query, { limit: 5 }).map((m) => ({
              interestId: m.interest.interestId,
              name: m.interest.name,
              slug: m.interest.slug,
              level: m.interest.level,
            })),
            people: await Promise.all(
              (await this.people.search(req.viewer!.userId, query, 5)).map((p) =>
                this.profiles.toPublicProfile(p),
              ),
            ),
          }
        : null;

    return {
      items: page.items,
      // Nested under `page`, like every other list endpoint (007's `ApiPage`).
      page: {
        nextCursor: page.nextCursor,
        emptyStateHint: page.items.length === 0 ? 'no_results' : null,
      },
      // Diagnostic and product data at once: a person who searched "the" and got
      // nothing is better served by being told which words were used than by an
      // empty list that looks like a broken search.
      meta: { terms: page.terms },
      ...(fallback ? { fallback } : {}),
    };
  }
}
