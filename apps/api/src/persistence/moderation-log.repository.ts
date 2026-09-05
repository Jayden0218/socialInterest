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
  async append(action: Omit<ModerationAction, 'actionId' | 'timestamp'>): Promise<ModerationAction> {
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
    return entry;
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
