import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  Post,
  Body,
  Query,
  Put,
  HttpCode,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { DomainError } from '../../common/errors/problem.filter';
import type { AppRequest } from '../../common/http/request';
import { Public } from '../../common/auth/auth.guard';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import { zodBody } from '../../common/http/validation';
import { CATALOGUE_SEARCH, type CatalogueSearch } from './catalogue.cache';
import { InterestSearch, type SearchResult } from './catalogue.search';
import { DuplicateInterestError, InterestService } from './interest.service';
import { InterestFollowService } from './interest-follow.service';
import { PostQueryService } from '../posts/post-query.service';

// 013/FR-004. `createInterestSchema` IS DELETED with `POST /interests`. It
// survived the route's removal as a declared-but-unreferenced const — and it
// still made `parentId` mandatory, which is the single field 013 exists to
// remove. Naming an interest is validated on the publish route now.

// 013/T009a. `level` and `parent` are gone from the contract with the hierarchy.
const toRef = (r: SearchResult) => ({
  interestId: r.interest.interestId,
  name: r.interest.name,
  slug: r.interest.slug,
  postCount: r.interest.postCount,
  followerCount: r.interest.followerCount,
  state: r.interest.state,
});

/**
 * How many tiles get a mosaic. Above the fold on a 390pt phone is six; eight
 * leaves a row in hand without turning a browse into a fan-out.
 */
const PREVIEW_TILES = 8;

@Controller('interests')
export class InterestController {
  constructor(
    @Inject(InterestService) private readonly interests: InterestService,
    @Inject(InterestSearch) private readonly search: InterestSearch,
    @Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch,
    @Inject(InterestFollowService) private readonly follows: InterestFollowService,
    @Inject(PostQueryService) private readonly posts: PostQueryService,
  ) {}

  /**
   * FR-029. The onboarding path SC-006 measures: someone new should find and
   * follow three relevant interests within two minutes, so this must return
   * interests worth following rather than an arbitrary slice of the catalogue.
   *
   * Declared before ':interestId' so the literal path wins the route match.
   */
  @Get('suggested')
  async suggested(@Req() req: AppRequest) {
    const ids = await this.follows.suggest(req.viewer!.userId);
    const items = ids
      .map((id) => this.catalogue.byId(id))
      .filter((i): i is NonNullable<typeof i> => i !== undefined)
      .map((interest) => toRef({ interest, parent: null, similarity: 1 }));
    return {
      items,
      page: { nextCursor: null, emptyStateHint: items.length === 0 ? 'no_results' : null },
    };
  }

  /** FR-025 browse, FR-026 type-ahead. Readable signed out. */
  @Public()
  @Get()
  // 013/FR-003. `level` AND `parentId` ARE GONE FROM THE SIGNATURE, not merely
  // unread. Interests are flat, so neither has anything to filter by — and an
  // accepted-and-ignored filter is one a caller cannot tell from a filter that
  // matched everything. The contract declared both until this change too.
  async browseOrSearch(
    @Req() req: AppRequest,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    const opts = {
      limit: limit ? Math.min(50, Math.max(1, Number(limit))) : 20,
    };
    const results = q ? this.search.search(q, opts) : this.search.browse(opts);
    /**
     * 012/FR-032. THE COUNTS COME FROM THE ROWS, for the reason spelled out on
     * the detail route below: the catalogue cache is a search index and the
     * numbers on it are whatever the process booted with. An Explore tile whose
     * count is stale is the "choosing is guessing" this requirement exists to
     * end, so the page's own rows are read — bounded at fifty by `limit`.
     */
    const fresh = await this.interests.countsFor(results.map((r) => r.interest.interestId));

    /**
     * 012/FR-031, FR-032. THE MOSAIC — AND THIS IS A POST READ PATH.
     *
     * `Explore.dc.html` draws four photographs above each interest's name, so
     * that a browse surface shows something worth looking at before anything is
     * typed. That means post MEDIA reaches a viewer here, and Constitution II
     * applies: this is surface 17, `interest preview`, with a row in the matrix
     * and a probe in `surface-routing.spec.ts`.
     *
     * `surface-routing` predicted this change in writing, on the `interest
     * search` row: "if a post count is ever added to that response it becomes a
     * real post read path and needs a probe here, not a comment". It was right
     * about the direction and this is that probe.
     *
     * NO SECOND PREDICATE. `previewForInterests` calls `listByInterest` — the
     * interest space's own method — so the boundary makes exactly the decision
     * it already makes, N times. See its note.
     *
     * BROWSE ONLY, AND BOUNDED. A type-ahead answers per keystroke and must
     * stay a name lookup; the mosaic is for the resting state. Eight tiles is
     * what a phone shows above the fold.
     */
    const previews =
      q || results.length === 0
        ? new Map<string, string[]>()
        : await this.posts.previewForInterests(
            req.viewer ?? null,
            results.slice(0, PREVIEW_TILES).map((r) => r.interest.interestId),
          );

    return {
      items: results.map((r) => ({
        ...toRef({ ...r, interest: fresh.get(r.interest.interestId) ?? r.interest }),
        ...(previews.has(r.interest.interestId)
          ? { preview: previews.get(r.interest.interestId) }
          : {}),
      })),
      page: {
        nextCursor: null,
        emptyStateHint: results.length === 0 ? 'no_results' : null,
      },
    };
  }

  /**
   * FR-023. Separate from POST so the warning appears WHILE the person types,
   * rather than as a rejection after they submit. SC-008 measures whether that
   * distinction actually reduces duplicates.
   */
  @Public()
  @Get('similar')
  // 013/FR-008. `parentId` IS NO LONGER REQUIRED OR READ. The comparison is
  // global, so scoping it to a parent is meaningless — and demanding one would
  // have made this endpoint unreachable from a compose screen that has none.
  similar(@Query('name') name: string) {
    if (!name) {
      throw new DomainError(HttpStatus.UNPROCESSABLE_ENTITY, 'Validation failed', 'name is required');
    }
    return {
      candidates: this.search.findSimilar(name).map((r) => ({
        interest: toRef(r),
        similarity: Number(r.similarity.toFixed(3)),
      })),
    };
  }

  /**
   * 013/FR-004, FR-025. `POST /v1/interests` IS REMOVED, DELIBERATELY.
   *
   * It created an interest with `postCount: 0`, which FR-004 now forbids: an
   * interest comes into existence only as part of publishing a post into it, so
   * that an interest with no posts cannot be created. Leaving the route would
   * have made FR-004 a thing the product says rather than a thing it enforces.
   *
   * THE ROUTE SNAPSHOT MOVES, AND THAT IS THE REVIEWED EDIT FR-025 ALLOWS.
   * Research R5 named this consequence before the work started rather than
   * discovering it as a diff: "POST /v1/interests as a standalone creation
   * route becomes unreachable for ordinary use. Whether it is removed is an
   * FR-025 question." It is removed.
   *
   * Naming an interest now happens on `POST /v1/posts` via `interestNames`,
   * which is also the only place the duplicate gate can be answered usefully —
   * a person is choosing what their photograph is about, not administering a
   * taxonomy.
   */

  /**
   * 004/FR-025, FR-030.
   *
   * 013/FR-002. THE CREATOR, or an operator. There is no curated tier any more:
   * every interest is made by a person, so the asymmetry this rule used to
   * carry — operators for the twelve we owned, creators for everything under
   * them — has nothing left to distinguish.
   *
   * The description is CONTENT, so it is reportable as `interest-description`
   * and the same content policy applies (Constitution IV: user-generated names
   * and text are content).
   */
  @Put(':interestId/description')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setDescription(
    @Req() req: AppRequest,
    @Param('interestId') interestId: string,
    @Body() body: unknown,
  ): Promise<void> {
    const { description } = zodBody(
      z.object({ description: z.string().max(500) }),
      body,
    );
    const interest = this.catalogue.byId(interestId);
    if (!interest) throw new DomainError(HttpStatus.NOT_FOUND, 'No such interest');

    const isOperator = req.viewer?.isOperator === true;
    // 013. Every interest has a creator now — there is no curated tier whose
    // description only an operator may set.
    const isCreator = interest.createdBy === req.viewer?.userId;
    if (!isOperator && !isCreator) {
      throw new DomainError(
        HttpStatus.FORBIDDEN,
        'Not permitted to describe this interest',
        'Only the person who created an interest, or an operator, can describe it.',
      );
    }

    await this.interests.setDescription(interestId, description);
  }

  /** FR-025, and FR-030's redirect for a merged interest. */
  @Public()
  @Get(':interestId')
  async detail(
    @Param('interestId') interestId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    /**
     * THE ROW, NOT THE CACHE — AND THE COUNTS WERE STALE UNTIL THIS.
     *
     * `InMemoryCatalogueCache` loads once at boot and refreshes only when an
     * interest is CREATED, merged, retired or described. It is a search index:
     * names, slugs and state, which is what it was built for (research D3).
     * `postCount` and `followerCount` are neither, and serving them from it
     * meant a follow incremented the ITEM while every reader went on seeing
     * whatever the number was when the process started.
     *
     * `setDescription` already knew this and says so in its own comment — "a
     * description written to the item and not to the cache would be invisible
     * until the next restart, which is the kind of 'saved but not showing' that
     * reads as data loss". It refreshes for that reason. A follow cannot: a
     * full catalogue reload per follow, and per POST once 012/FR-032 gave
     * `postCount` a writer, is a table scan on a hot path.
     *
     * So the counts come from the row. One point read, on a route that is
     * already a round trip, and the cache keeps the job it is good at.
     */
    const stored = await this.interests.findById(interestId);
    const cached = this.catalogue.byId(interestId);
    const interest = stored ?? cached;
    if (!interest) throw new DomainError(HttpStatus.NOT_FOUND, 'No such interest');

    if (interest.state === 'merged' && interest.mergedIntoId) {
      // 301 rather than 404: links and share URLs to the source keep working
      // after a merge, which is what stops FR-030 orphaning anything.
      res.status(HttpStatus.MOVED_PERMANENTLY);
      res.setHeader('Location', `/v1/interests/${interest.mergedIntoId}`);
      return { mergedInto: interest.mergedIntoId };
    }

    const base = toRef({ interest, parent: null, similarity: 1 });
    return {
      ...base,
      ...(interest.description ? { description: interest.description } : {}),
      ...(interest.descriptionUpdatedAt ? { descriptionUpdatedAt: interest.descriptionUpdatedAt } : {}),
      // 013/FR-003. `subInterests` is gone: interests are flat, so there are no
      // children to list. 001/FR-020's listing described a hierarchy that no
      // longer exists.
    };
  }
}
