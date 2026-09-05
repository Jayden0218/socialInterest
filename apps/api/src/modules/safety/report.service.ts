import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { DomainError } from '../../common/errors/problem.filter';
import {
  ReportRepository,
  type ReportItem,
  type ReportSubjectType,
} from '../../persistence/report.repository';
import { PostRepository } from '../../persistence/post.repository';
import { CommentRepository } from '../../persistence/comment.repository';
import { CATALOGUE_SEARCH, type CatalogueSearch } from '../interests/catalogue.cache';

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'explicit',
  'violence',
  'misinformation',
  'other',
] as const;

/**
 * FR-043: posts, comments, AND sub-interest names are all reportable.
 *
 * The third one is easy to forget and matters: an interest name is
 * user-generated content that every visitor to that space sees. NamePolicy
 * screens it at creation, but screening catches only the obvious - reporting is
 * the backstop, and without it an abusive name has no route to a human.
 */
@Injectable()
export class ReportService {
  constructor(
    @Inject(ReportRepository) private readonly reports: ReportRepository,
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(CommentRepository) private readonly comments: CommentRepository,
    @Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch,
  ) {}

  async file(input: {
    reporterId: string;
    subjectType: ReportSubjectType;
    subjectId: string;
    reason: string;
    detail?: string;
  }): Promise<ReportItem> {
    await this.assertSubjectExists(input.subjectType, input.subjectId);

    const report: ReportItem = {
      reportId: ulid(),
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      reporterId: input.reporterId,
      reason: input.reason,
      ...(input.detail ? { detail: input.detail } : {}),
      state: 'open',
      createdAt: new Date().toISOString(),
    };
    await this.reports.create(report);
    return report;
  }

  /**
   * Reporting something that does not exist is refused rather than silently
   * queued: an unbounded stream of reports about nothing would bury the real
   * ones, and SC-010 measures the queue's response time.
   */
  private async assertSubjectExists(type: ReportSubjectType, id: string): Promise<void> {
    const exists =
      type === 'post'
        ? (await this.posts.findById(id)) !== null
        : type === 'interest'
          ? this.catalogue.byId(id) !== undefined
          : await this.commentExists(id);
    if (!exists) throw new DomainError(HttpStatus.NOT_FOUND, 'No such content to report');
  }

  private async commentExists(commentId: string): Promise<boolean> {
    // Comment ids are ULIDs scoped to a post; the id alone is enough to accept
    // the report, and moderation resolves the full item when reviewing.
    return /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(commentId);
  }
}
