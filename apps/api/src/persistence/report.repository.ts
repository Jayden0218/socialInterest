import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { keys } from './keys';

export type ReportSubjectType = 'post' | 'comment' | 'interest';
export type ReportState = 'open' | 'under_review' | 'actioned' | 'dismissed';

export interface ReportItem {
  reportId: string;
  subjectType: ReportSubjectType;
  subjectId: string;
  reporterId: string;
  reason: string;
  detail?: string;
  state: ReportState;
  createdAt: string;
  resolvedAt?: string;
  moderatorId?: string;
  outcome?: string;
}

/**
 * A19. The queue is ordered oldest-first via GSI1, and that ordering is what
 * makes SC-010 (95% of reports decided within 24 hours) measurable rather than
 * aspirational - newest-first would quietly starve the oldest reports.
 */
@Injectable()
export class ReportRepository extends BaseRepository {
  async create(report: ReportItem): Promise<void> {
    await this.putItem({
      ...keys.report(report.reportId),
      ...keys.reportByState(report.state, report.createdAt),
      type: 'Report',
      ...report,
    });
  }

  async findById(reportId: string): Promise<ReportItem | null> {
    return this.getItem<ReportItem>(keys.report(reportId));
  }

  async listByState(
    state: ReportState,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<ReportItem>> {
    return this.query<ReportItem>(`RSTATE#${state}`, {
      indexName: 'gsi1',
      ascending: true, // oldest first
      limit: opts.limit ?? 25,
      cursor: opts.cursor ?? null,
    });
  }

  async transition(reportId: string, patch: Partial<ReportItem>): Promise<ReportItem> {
    const existing = await this.findById(reportId);
    if (!existing) throw new Error(`report ${reportId} not found`);
    const updated = { ...existing, ...patch };
    await this.putItem({
      ...keys.report(reportId),
      // GSI1 key follows the state, so the queue reflects the transition.
      ...keys.reportByState(updated.state, updated.createdAt),
      type: 'Report',
      ...updated,
    });
    return updated;
  }
}
