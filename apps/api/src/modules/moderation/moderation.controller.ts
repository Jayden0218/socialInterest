import { Body, Controller, Get, HttpStatus, Inject, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { DomainError } from '../../common/errors/problem.filter';
import type { AppRequest } from '../../common/http/request';
import { OperatorGuard } from '../../common/auth/operator.guard';
import { zodBody } from '../../common/http/validation';
import { ReportRepository, type ReportState } from '../../persistence/report.repository';
import { ModerationLogRepository } from '../../persistence/moderation-log.repository';
import { PostRepository } from '../../persistence/post.repository';
import { ConversationRepository } from '../../persistence/conversation.repository';
import { RatingRepository } from '../../persistence/rating.repository';
import { NotificationRepository } from '../../persistence/notification.repository';
import { MessageRepository } from '../../persistence/message.repository';
import { CommentRepository } from '../../persistence/comment.repository';

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
    @Inject(RatingRepository) private readonly ratings: RatingRepository,
    @Inject(ConversationRepository) private readonly conversations: ConversationRepository,
    @Inject(CommentRepository) private readonly comments: CommentRepository,
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
    /**
     * 005/FR-015, FR-016 and research R6. Removing a review takes its RATING
     * with it - `setRemovedByModeration` decrements the place's aggregate in the
     * same transaction that marks the row.
     *
     * The alternative - keep the score, drop the text - is defensible in
     * principle and wrong here: the cases that produce a removal (abuse, spam, a
     * competitor's sabotage) are cases where the score is as untrustworthy as the
     * words, and leaving a 1-star rating from a removed abusive review makes
     * removal a partial win for the abuser.
     *
     * Consequence, stated rather than hidden: MODERATION CHANGES A PLACE'S PUBLIC
     * RATING. That is intended, and is why the decision is written to the
     * append-only log like every other one.
     */
    if (removing && report.subjectType === 'review') {
      const [placeId, raterId] = report.subjectId.split(':');
      if (placeId && raterId) {
        await this.ratings.setRemovedByModeration(placeId, raterId);
      }
    }
    /**
     * 005/FR-024 and research R8. BLANKS the name; the conversation survives.
     *
     * The same rule 004 set for a message: removing one withholds its body and
     * leaves the thread readable, because silently deleting a conversation is
     * indistinguishable from a bug to the people in it. A group whose name was
     * abusive is still a group of people who were talking, and destroying it
     * punishes everyone for one person's text.
     */
    if (removing && report.subjectType === 'conversation-name') {
      await this.conversations.removeName(report.subjectId);
    }
    /**
     * 008/FR-026 — AND THE HALF THAT DID NOT EXIST AT ALL.
     *
     * `report.service.ts` has accepted `subjectType: 'comment'` since 001, and
     * a moderator's removal transitioned the report and wrote the audit log
     * while THE COMMENT STAYED ON THE PAGE. Reporting existed, removal did not:
     * the declared-half-with-no-other-half pattern 008 exists to end, on a
     * Constitution IV release gate.
     *
     * Removal WITHHOLDS THE BODY and leaves the row, so replies keep their
     * parent and the thread keeps its shape (FR-026) — the rule 005 set for a
     * conversation name and for a message, now in a third place. A comment id
     * alone does not locate the row (the key carries the post and `createdAt`),
     * so the subject id carries the post: `<postId>:<commentId>`, the same
     * composite `review` and `message` already use.
     */
    if (removing && report.subjectType === 'comment') {
      const [postId, commentId] = report.subjectId.includes(':')
        ? report.subjectId.split(':')
        : [null, report.subjectId];
      if (postId && commentId) {
        const existing = await this.comments.findById(postId, commentId);
        if (existing) {
          await this.comments.setModerationState(
            { postId, commentId, createdAt: existing.createdAt },
            'removed',
          );
        }
      }
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

    /**
     * 005/FR-015. The review's author is told, on the same path a post's author
     * is told.
     *
     * This is why the addendum makes a removed review `gone` even to its own
     * author: they learn of the removal HERE rather than by finding the review
     * still sitting on the page, which reads as "the removal did not work" and
     * invites a second submission.
     */
    if (removing && report.subjectType === 'review') {
      const [, raterId] = report.subjectId.split(':');
      if (raterId) {
        await this.notifications.create({
          recipientId: raterId,
          kind: 'comment',
          actorId: 'SYSTEM',
        });
      }
    }

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
