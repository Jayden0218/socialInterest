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

const createInterestSchema = z.object({
  name: z.string().min(2).max(50),
  parentId: z.string().min(1),
  description: z.string().max(500).optional(),
  acknowledgedSimilarTo: z.array(z.string()).optional(),
});

const toRef = (r: SearchResult) => ({
  interestId: r.interest.interestId,
  name: r.interest.name,
  slug: r.interest.slug,
  level: r.interest.level,
  parent: r.parent
    ? {
        interestId: r.parent.interestId,
        name: r.parent.name,
        slug: r.parent.slug,
        level: r.parent.level,
      }
    : null,
  postCount: r.interest.postCount,
  followerCount: r.interest.followerCount,
  state: r.interest.state,
});

@Controller('interests')
export class InterestController {
  constructor(
    @Inject(InterestService) private readonly interests: InterestService,
    @Inject(InterestSearch) private readonly search: InterestSearch,
    @Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch,
    @Inject(InterestFollowService) private readonly follows: InterestFollowService,
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
  browseOrSearch(
    @Query('q') q?: string,
    @Query('level') level?: 'top' | 'sub',
    @Query('parentId') parentId?: string,
    @Query('limit') limit?: string,
  ) {
    const opts = {
      ...(level ? { level } : {}),
      ...(parentId ? { parentId } : {}),
      limit: limit ? Math.min(50, Math.max(1, Number(limit))) : 20,
    };
    const results = q ? this.search.search(q, opts) : this.search.browse(opts);
    return {
      items: results.map(toRef),
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
  similar(@Query('name') name: string, @Query('parentId') parentId: string) {
    if (!name || !parentId) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Validation failed',
        'name and parentId are both required',
      );
    }
    return {
      candidates: this.search.findSimilar(name, parentId).map((r) => ({
        interest: toRef(r),
        similarity: Number(r.similarity.toFixed(3)),
      })),
    };
  }

  /** FR-022, FR-023, FR-031. */
  @Post()
  @RateLimit({ capacity: 5, refillPerSecond: 0.05 })
  async create(@Req() req: AppRequest, @Body() body: unknown) {
    const input = zodBody(createInterestSchema, body);
    try {
      const created = await this.interests.createSubInterest({
        name: input.name,
        parentId: input.parentId,
        ...(input.description ? { description: input.description } : {}),
        createdBy: req.viewer!.userId,
        ...(input.acknowledgedSimilarTo ? { acknowledgedSimilarTo: input.acknowledgedSimilarTo } : {}),
      });
      return toRef({ interest: created, parent: this.catalogue.byId(created.parentId!) ?? null, similarity: 1 });
    } catch (e) {
      if (e instanceof DuplicateInterestError) {
        // 409 carrying the candidates, so the client can offer "join this one".
        const problem = e.getResponse() as Record<string, unknown>;
        problem['candidates'] = e.candidates.map((r) => ({
          interest: toRef(r),
          similarity: Number(r.similarity.toFixed(3)),
        }));
      }
      throw e;
    }
  }

  /**
   * 004/FR-025, FR-030.
   *
   * Operators for a top-level interest; the CREATOR or an operator for a
   * sub-interest. The asymmetry matches who is accountable for each: top-level
   * interests are curated (001/FR-021), sub-interests are made by people
   * (001/FR-022).
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
    const isCreator = interest.level === 'sub' && interest.createdBy === req.viewer?.userId;
    if (!isOperator && !isCreator) {
      throw new DomainError(
        HttpStatus.FORBIDDEN,
        'Not permitted to describe this interest',
        interest.level === 'top'
          ? 'Top-level interests are curated by operators.'
          : 'Only the person who created a sub-interest, or an operator, can describe it.',
      );
    }

    await this.interests.setDescription(interestId, description);
  }

  /** FR-025, and FR-030's redirect for a merged interest. */
  @Public()
  @Get(':interestId')
  detail(@Param('interestId') interestId: string, @Res({ passthrough: true }) res: Response) {
    const interest = this.catalogue.byId(interestId);
    if (!interest) throw new DomainError(HttpStatus.NOT_FOUND, 'No such interest');

    if (interest.state === 'merged' && interest.mergedIntoId) {
      // 301 rather than 404: links and share URLs to the source keep working
      // after a merge, which is what stops FR-030 orphaning anything.
      res.status(HttpStatus.MOVED_PERMANENTLY);
      res.setHeader('Location', `/v1/interests/${interest.mergedIntoId}`);
      return { mergedInto: interest.mergedIntoId };
    }

    const base = toRef({ interest, parent: interest.parentId ? this.catalogue.byId(interest.parentId) ?? null : null, similarity: 1 });
    return {
      ...base,
      ...(interest.description ? { description: interest.description } : {}),
      ...(interest.descriptionUpdatedAt ? { descriptionUpdatedAt: interest.descriptionUpdatedAt } : {}),
      // Sub-interests are listed for a top-level interest only (FR-020).
      ...(interest.level === 'top'
        ? {
            subInterests: this.catalogue
              .childrenOf(interest.interestId)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((i) => toRef({ interest: i, parent: interest, similarity: 1 })),
          }
        : {}),
    };
  }
}
