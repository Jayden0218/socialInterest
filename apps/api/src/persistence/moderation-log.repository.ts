import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { BaseRepository, type Page } from './base.repository';
import { keys } from './keys';

export interface ModerationAction {
  actionId: string;
  moderatorId: string;
  subjectType: string;
  subjectId: string;
  reportId?: string;
  action: string;
  note?: string;
  timestamp: string;
}

/**
 * 008/FR-046 — THE SAME EVENT, ADDRESSED TO THE PERSON IT HAPPENED TO.
 *
 * A NOTICE IS NOT A LOG ENTRY WITH A DIFFERENT KEY. It carries what the author
 * may be told — the subject, the action and the REPORTED REASON — and
 * deliberately not `moderatorId` or `note`: the note is internal, and naming the
 * moderator invites the retaliation the moderation queue exists to absorb.
 */
export interface ModerationNotice {
  actionId: string;
  recipientId: string;
  subjectType: string;
  subjectId: string;
  action: string;
  /** The reporter's CATEGORY, never their words. */
  reason?: string;
  timestamp: string;
  /** 008/FR-047. Set once the author appeals, so the notice can say so. */
  appealId?: string;
}

/**
 * FR-047: moderation decisions must be auditable LATER.
 *
 * Append-only and stored separately from the subject, so the record survives the
 * subject's deletion. Writing the outcome onto the post or comment would erase
 * the audit trail at exactly the moment it matters - when content was removed
 * and someone later asks why.
 *
 * Partitioned by month so the log stays queryable as it grows.
 */
@Injectable()
export class ModerationLogRepository extends BaseRepository {
  /**
   * 008/FR-046. `notify` writes the AUTHOR'S NOTICE in the same call.
   *
   * One call, two rows, deliberately: before 008 the author of a removed post
   * got a `comment` notification from `SYSTEM` with no subject and no reason —
   * a notification that something happened, which is not being told what and
   * why. Making the recipient a parameter of `append` means a removal that is
   * logged and never explained cannot be written, rather than being a thing
   * every future call site has to remember.
   */
  async append(
    action: Omit<ModerationAction, 'actionId' | 'timestamp'>,
    notify?: { recipientId: string; reason?: string },
  ): Promise<ModerationAction> {
    const entry: ModerationAction = {
      ...action,
      actionId: ulid(),
      timestamp: new Date().toISOString(),
    };
    const yyyymm = entry.timestamp.slice(0, 7);
    await this.putItem({
      ...keys.moderationLog(yyyymm, entry.timestamp, entry.actionId),
      type: 'ModerationAction',
      ...entry,
    });
    if (notify) {
      await this.putItem({
        ...keys.moderationNotice(notify.recipientId, entry.timestamp, entry.actionId),
        type: 'ModerationNotice',
        actionId: entry.actionId,
        recipientId: notify.recipientId,
        subjectType: entry.subjectType,
        subjectId: entry.subjectId,
        action: entry.action,
        ...(notify.reason ? { reason: notify.reason } : {}),
        timestamp: entry.timestamp,
      });
    }
    return entry;
  }

  /** 008/FR-046, A55. Newest first — the most recent removal is the live question. */
  async listNotices(
    recipientId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<ModerationNotice>> {
    return this.query<ModerationNotice>(`USER#${recipientId}`, {
      skPrefix: 'MODNOTICE#',
      limit: opts.limit ?? 25,
      cursor: opts.cursor ?? null,
    });
  }

  async findNotice(recipientId: string, actionId: string): Promise<ModerationNotice | null> {
    const page = await this.listNotices(recipientId, { limit: 100 });
    return page.items.find((n) => n.actionId === actionId) ?? null;
  }

  /** 008/FR-047. Links the appeal back to the notice it answers. */
  async attachAppeal(notice: ModerationNotice, appealId: string): Promise<void> {
    await this.putItem({
      ...keys.moderationNotice(notice.recipientId, notice.timestamp, notice.actionId),
      type: 'ModerationNotice',
      ...notice,
      appealId,
    });
  }

  async listMonth(
    yyyymm: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<ModerationAction>> {
    return this.query<ModerationAction>(`MODLOG#${yyyymm}`, {
      ascending: true,
      limit: opts.limit ?? 50,
      cursor: opts.cursor ?? null,
    });
  }
}
