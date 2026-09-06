import { Body, Controller, Get, HttpStatus, Inject, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { DomainError } from '../../common/errors/problem.filter';
import type { AppRequest } from '../../common/http/request';
import { OperatorGuard } from '../../common/auth/operator.guard';
import { zodBody } from '../../common/http/validation';
import { ReportRepository, type ReportState } from '../../persistence/report.repository';
import { ModerationLogRepository } from '../../persistence/moderation-log.repository';
import { PostRepository } from '../../persistence/post.repository';
import { NotificationRepository } from '../../persistence/notification.repository';
import { MessageRepository } from '../../persistence/message.repository';

const decisionSchema = z.object({
  state: z.enum(['under_review', 'actioned', 'dismissed']),
  action: z.enum(['remove_content', 'rename_interest', 'retire_interest', 'no_action']).optional(),
  note: z.string().max(1000).optional(),
});

@Controller('moderation')
@UseGuards(OperatorGuard)
export class ModerationController {
  constructor(
    @Inject(ReportRepository) private readonly reports: ReportRepository,
    @Inject(ModerationLogRepository) private readonly log: ModerationLogRepository,
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(MessageRepository) private readonly messages: MessageRepository,
    @Inject(NotificationRepository) private readonly notifications: NotificationRepository,
  ) {}

  /**
   * FR-045. Oldest-first, which is what makes SC-010 (95% decided within 24
   * hours) measurable - newest-first would starve the oldest reports while the
   * headline number still looked healthy.
   */
  @Get('reports')
  async queue(@Query('state') state?: ReportState, @Query('cursor') cursor?: string) {
    const page = await this.reports.listByState(state ?? 'open', { cursor: cursor ?? null });
    return {
      items: page.items,
      page: { nextCursor: page.nextCursor, emptyStateHint: page.items.length === 0 ? 'no_results' : null },
    };
  }

  /** FR-045 and FR-047. */
  @Patch('reports/:reportId')
  async decide(@Req() req: AppRequest, @Param('reportId') reportId: string, @Body() body: unknown) {
    const decision = zodBody(decisionSchema, body);
    const report = await this.reports.findById(reportId);
    if (!report) throw new DomainError(HttpStatus.NOT_FOUND, 'No such report');

    /**
     * `remove_content` means different things to different subjects, and the
     * difference is not cosmetic: removing a MESSAGE withholds its body and
     * leaves the thread readable (004 addendum, rule 6), because silently
     * deleting a conversation is indistinguishable from a bug to both people in
     * it. A place and an interest description are handled by their own admin
     * endpoints; here they are recorded, not mutated.
     */
    const removing = decision.action === 'remove_content';
    if (removing && report.subjectType === 'post') {
      await this.posts.setRemovedByModeration(report.subjectId);
    }
    if (removing && report.subjectType === 'message') {
      const [conversationId, messageId] = report.subjectId.split(':');
      if (conversationId && messageId) {
        await this.messages.setModerationState(conversationId, messageId, 'removed');
      }
    }

    const updated = await this.reports.transition(reportId, {
      state: decision.state,
      moderatorId: req.viewer!.userId,
      ...(decision.action ? { outcome: decision.action } : {}),
      ...(decision.state !== 'under_review' ? { resolvedAt: new Date().toISOString() } : {}),
    });

    // FR-047: written to an append-only log, separate from the subject, so the
    // record outlives the content it concerns.
    await this.log.append({
      moderatorId: req.viewer!.userId,
      subjectType: report.subjectType,
      subjectId: report.subjectId,
      reportId,
      action: decision.action ?? decision.state,
      ...(decision.note ? { note: decision.note } : {}),
    });

    // FR-045: the author is told when their content is removed.
    if (removing && report.subjectType === 'post') {
      const post = await this.posts.findById(report.subjectId);
      if (post) {
        await this.notifications.create({
          recipientId: post.authorId,
          kind: 'comment',
          actorId: 'SYSTEM',
          postId: post.postId,
        });
      }
    }

    return updated;
  }
}
