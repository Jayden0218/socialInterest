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
    /**
     * 004/FR-042 adds three. Constitution IV: user-generated names and text are
     * CONTENT, and each new one must be reportable in the same release that
     * introduces it.
     *
     * A message is addressed `<conversationId>:<messageId>` - a message id alone
     * does not locate a message, and the composite is also the only form a
     * participant can produce, so an outsider cannot fish for ids by reporting.
     */
    subjectType:
      | 'post'
      | 'comment'
      | 'interest'
      | 'message'
      | 'place'
      | 'interest-description'
      // 005/FR-014.
      | 'review';
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

  /**
   * The moderation queue. Operators only - the API refuses everyone else, which
   * is what the journeys assert rather than the app hiding the button.
   */
  reports(opts: { state?: string; limit?: number; cursor?: string } = {}): Promise<{
    items: { reportId: string; subjectType: string; subjectId: string; state: string }[];
    nextCursor?: string;
  }> {
    return this.client.call('getModerationReports', {
      query: { state: opts.state, limit: opts.limit, cursor: opts.cursor },
    });
  }

  decide(
    reportId: string,
    decision: { state: 'under_review' | 'actioned' | 'dismissed'; action?: string; note?: string },
  ): Promise<unknown> {
    return this.client.call('patchModerationReportsByReportId', {
      params: { reportId },
      body: decision,
    });
  }
}
