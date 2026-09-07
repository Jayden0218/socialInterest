import { Body, Controller, Delete, HttpCode, HttpStatus, Inject, Param, Post, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import type { AppRequest } from '../../common/http/request';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import { zodBody } from '../../common/http/validation';
import { ReportService, REPORT_REASONS } from './report.service';
import { BlockService } from './block.service';

const reportSchema = z.object({
  subjectType: z.enum([
    'post',
    'comment',
    'interest',
    'message',
    'place',
    'interest-description',
    // 005/FR-014. Two entries in an enum that already exists and one branch in
    // moderation - review safety EXTENDS machinery rather than inventing it
    // (research R7), and reporting that honestly is more useful than inflating it.
    'review',
    'conversation-name',
  ]),
  subjectId: z.string().min(1),
  reason: z.enum(REPORT_REASONS),
  detail: z.string().max(1000).optional(),
});

@Controller()
export class SafetyController {
  constructor(
    @Inject(ReportService) private readonly reports: ReportService,
    @Inject(BlockService) private readonly blocks: BlockService,
  ) {}

  /** FR-043. All three subject types, including interest names. */
  @Post('reports')
  @RateLimit({ capacity: 15, refillPerSecond: 0.2 })
  async report(@Req() req: AppRequest, @Body() body: unknown) {
    const input = zodBody(reportSchema, body);
    return this.reports.file({ reporterId: req.viewer!.userId, ...input });
  }

  /** FR-044. */
  @Put('blocks/:handle')
  @HttpCode(HttpStatus.NO_CONTENT)
  async block(@Req() req: AppRequest, @Param('handle') handle: string): Promise<void> {
    await this.blocks.block(req.viewer!.userId, handle);
  }

  @Delete('blocks/:handle')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unblock(@Req() req: AppRequest, @Param('handle') handle: string): Promise<void> {
    await this.blocks.unblock(req.viewer!.userId, handle);
  }
}
