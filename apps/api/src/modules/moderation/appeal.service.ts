import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { DomainError } from '../../common/errors/problem.filter';
import {
  AppealRepository,
  type AppealItem,
  type AppealState,
  type AppealSubjectKind,
} from '../../persistence/appeal.repository';
import { ModerationLogRepository } from '../../persistence/moderation-log.repository';
import { NotificationRepository } from '../../persistence/notification.repository';

/**
 * 008/FR-046 to FR-048 — BEING TOLD, AND BEING ABLE TO DISAGREE.
 *
 * Constitution IV: safety ships with the product. A removal the author is never
 * told about and cannot contest is not moderation, it is disappearance — and
 * before 008 the author of a removed post got a `comment` notification from
 * `SYSTEM` carrying no subject and no reason. Being told SOMETHING happened is
 * not being told what and why.
 *
 * THE APPEAL IS ANCHORED TO A NOTICE, not to a subject id. That is the whole
 * authorisation model: an appeal can only be filed against a notice addressed to
 * the caller, so "may this person appeal this" is answered by a read of their
 * OWN partition rather than by a chain of ownership lookups per subject kind.
 * Four subject kinds means four ways to get that chain wrong.
 */
@Injectable()
export class AppealService {
  constructor(
    @Inject(AppealRepository) private readonly appeals: AppealRepository,
    @Inject(ModerationLogRepository) private readonly log: ModerationLogRepository,
    @Inject(NotificationRepository) private readonly notifications: NotificationRepository,
  ) {}

  /** FR-046. What was removed of mine, and why. */
  async notices(recipientId: string, opts: { limit?: number; cursor?: string | null } = {}) {
    return this.log.listNotices(recipientId, opts);
  }

  /**
   * FR-047. One appeal per notice.
   *
   * A second appeal against the same decision is refused rather than queued: it
   * is the same disagreement, and letting it through would let one person fill
   * the queue that SC-010's 24-hour target is measured against.
   */
  async create(
    authorId: string,
    input: { actionId: string; body: string },
  ): Promise<AppealItem> {
    const notice = await this.log.findNotice(authorId, input.actionId);
    /**
     * 404, not 403. A notice that is not yours is indistinguishable from one
     * that does not exist, so an appeal id cannot be used to discover that
     * somebody else's content was removed — the error-distinction rule the
     * visibility contract sets for blocks, applied to moderation.
     */
    if (!notice) throw new DomainError(HttpStatus.NOT_FOUND, 'No such moderation notice');
    if (notice.appealId) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'Already appealed',
        'You have already appealed this decision. You will be told the outcome.',
      );
    }

    const appeal: AppealItem = {
      appealId: ulid(),
      subjectKind: notice.subjectType as AppealSubjectKind,
      subjectId: notice.subjectId,
      authorId,
      body: input.body,
      state: 'open',
      createdAt: new Date().toISOString(),
    };
    await this.appeals.create(appeal);
    // The notice carries the appeal id, so the list the author reads says which
    // decisions they have contested without a second query per row.
    await this.log.attachAppeal(notice, appeal.appealId);
    return appeal;
  }

  /** FR-047. My appeals and their outcomes. */
  async mine(authorId: string, opts: { limit?: number; cursor?: string | null } = {}) {
    return this.appeals.listByAuthor(authorId, opts);
  }

  /**
   * FR-048, SC-015. THE AUTHORISATION CHECK, in one place.
   *
   * Driven directly with another person's appeal id by
   * `appeal-privacy.spec.ts` — the path a modified client takes, which is the
   * only path Principle III accepts as evidence.
   */
  async read(viewerId: string, appealId: string, isOperator: boolean): Promise<AppealItem> {
    const appeal = await this.appeals.findById(appealId);
    if (!appeal) throw new DomainError(HttpStatus.NOT_FOUND, 'No such appeal');
    if (!isOperator && appeal.authorId !== viewerId) {
      // 404 again: a 403 would confirm the appeal exists and therefore that
      // somebody's content was removed.
      throw new DomainError(HttpStatus.NOT_FOUND, 'No such appeal');
    }
    return appeal;
  }

  /** A53. The operator queue, oldest first. */
  async queue(state: AppealState, opts: { limit?: number; cursor?: string | null } = {}) {
    return this.appeals.listByState(state, opts);
  }

  /**
   * FR-047 — THE OUTCOME IS APPENDED TO THE MODERATION LOG, and the author is
   * told.
   *
   * Both, in one call, for the same reason the removal notice is written by
   * `log.append`: an outcome that is recorded and never delivered leaves the
   * author waiting on a decision that has already been made, which is the
   * failure an appeals process exists to prevent.
   *
   * The log entry survives deletion of the subject (Constitution IV), which is
   * exactly when somebody asks what happened.
   */
  async decide(
    moderatorId: string,
    appealId: string,
    decision: { state: 'upheld' | 'rejected'; note?: string },
  ): Promise<AppealItem> {
    const appeal = await this.appeals.findById(appealId);
    if (!appeal) throw new DomainError(HttpStatus.NOT_FOUND, 'No such appeal');
    if (appeal.state !== 'open') {
      throw new DomainError(HttpStatus.CONFLICT, 'This appeal has already been decided');
    }

    const updated = await this.appeals.transition(appealId, {
      state: decision.state,
      moderatorId,
      outcome: decision.state,
      decidedAt: new Date().toISOString(),
    });

    await this.log.append(
      {
        moderatorId,
        subjectType: appeal.subjectKind,
        subjectId: appeal.subjectId,
        action: `appeal_${decision.state}`,
        ...(decision.note ? { note: decision.note } : {}),
      },
      // The author is told the outcome — FR-047's second half, and the one a
      // decision endpoint is most likely to be shipped without.
      { recipientId: appeal.authorId },
    );

    await this.notifications.create({
      recipientId: appeal.authorId,
      kind: 'comment',
      actorId: 'SYSTEM',
    });

    return updated;
  }
}
