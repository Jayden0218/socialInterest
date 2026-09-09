import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AppRequest } from '../../common/http/request';
import { OperatorGuard } from '../../common/auth/operator.guard';
import { zodBody } from '../../common/http/validation';
import type { AppealState } from '../../persistence/appeal.repository';
import { AppealService } from './appeal.service';

const appealSchema = z.object({
  /**
   * THE NOTICE, not the subject. An appeal is filed against a decision the
   * caller was told about, so the authorisation is a read of their own
   * partition rather than an ownership chain per subject kind — see
   * `AppealService`.
   */
  actionId: z.string().min(1),
  body: z.string().min(1).max(2000),
});

const decisionSchema = z.object({
  state: z.enum(['upheld', 'rejected']),
  note: z.string().max(1000).optional(),
});

const page = <T>(items: T[], nextCursor: string | null, emptyHint: string) => ({
  items,
  page: { nextCursor, emptyStateHint: items.length === 0 ? emptyHint : null },
});

/**
 * 008/FR-046, FR-047 — THE AUTHOR'S SIDE.
 *
 * Signed-in, not operator-guarded: these are a person's own notices and their
 * own appeals. The operator half is `AppealAdminController` below, and the two
 * are separate classes rather than one class with mixed guards because
 * 004/T-auth-surface recorded what happens when a `@Public()` or a guard sits
 * above a method somebody later inserts a new method in front of.
 */
@Controller()
export class AppealController {
  constructor(@Inject(AppealService) private readonly appeals: AppealService) {}

  /** FR-046. What was removed of mine, and why. */
  @Get('me/moderation-notices')
  async notices(
    @Req() req: AppRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.appeals.notices(req.viewer!.userId, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit))) : 25,
      cursor: cursor ?? null,
    });
    return page(result.items, result.nextCursor, 'no_moderation_notices');
  }

  /** FR-047. Disagree with one. 409 if this decision was already appealed. */
  @Post('appeals')
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: AppRequest, @Body() body: unknown) {
    return this.appeals.create(req.viewer!.userId, zodBody(appealSchema, body));
  }

  /** FR-047. My appeals and their outcomes. */
  @Get('me/appeals')
  async mine(
    @Req() req: AppRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.appeals.mine(req.viewer!.userId, {
      limit: limit ? Math.min(50, Math.max(1, Number(limit))) : 25,
      cursor: cursor ?? null,
    });
    return page(result.items, result.nextCursor, 'no_appeals');
  }

  /**
   * FR-048, SC-015. One appeal, by id.
   *
   * The route a hostile client reaches for, and the reason it exists here at
   * all: `appeal-privacy.spec.ts` drives it DIRECTLY with another person's
   * appeal id, which is the only evidence Principle III accepts. An endpoint
   * that is never exposed cannot be tested that way.
   */
  @Get('appeals/:appealId')
  async read(@Req() req: AppRequest, @Param('appealId') appealId: string) {
    return this.appeals.read(req.viewer!.userId, appealId, req.viewer!.isOperator === true);
  }
}

/** FR-047. The operator queue and the decision. */
@Controller('moderation')
@UseGuards(OperatorGuard)
export class AppealAdminController {
  constructor(@Inject(AppealService) private readonly appeals: AppealService) {}

  @Get('appeals')
  async queue(@Query('state') state?: AppealState, @Query('cursor') cursor?: string) {
    const result = await this.appeals.queue(state ?? 'open', { cursor: cursor ?? null });
    return page(result.items, result.nextCursor, 'no_results');
  }

  @Patch('appeals/:appealId')
  async decide(
    @Req() req: AppRequest,
    @Param('appealId') appealId: string,
    @Body() body: unknown,
  ) {
    return this.appeals.decide(req.viewer!.userId, appealId, zodBody(decisionSchema, body));
  }
}
