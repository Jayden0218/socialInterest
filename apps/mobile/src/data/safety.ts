import type { DataClient } from './client';

export type ReportReason = 'spam' | 'harassment' | 'explicit' | 'violence' | 'misinformation' | 'other';

/**
 * Reporting and blocking (002/T024).
 *
 * Constitution Principle IV: these are a release gate, not polish. They are in the
 * core journey set for exactly that reason - a build cannot go green with them
 * broken.
 */
export class SafetyData {
  constructor(private readonly client: DataClient) {}

  report(input: {
    subjectType: 'post' | 'comment' | 'interest';
    subjectId: string;
    reason: ReportReason;
    detail?: string;
  }): Promise<{ reportId: string }> {
    return this.client.call<{ reportId: string }>('postReports', { body: input });
  }

  /** Hides content in BOTH directions (FR-044), and must never disclose itself. */
  block(handle: string): Promise<void> {
    return this.client.call<void>('putBlocksByHandle', { params: { handle } });
  }

  unblock(handle: string): Promise<void> {
    return this.client.call<void>('deleteBlocksByHandle', { params: { handle } });
  }
}
