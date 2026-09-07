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
import { PlaceRepository } from '../../persistence/place.repository';
import { RatingRepository } from '../../persistence/rating.repository';
import { MessageRepository } from '../../persistence/message.repository';
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
    @Inject(PlaceRepository) private readonly places: PlaceRepository,
    @Inject(MessageRepository) private readonly messages: MessageRepository,
    @Inject(RatingRepository) private readonly ratings: RatingRepository,
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
    const exists = await this.subjectExists(type, id);
    if (!exists) throw new DomainError(HttpStatus.NOT_FOUND, 'No such content to report');
  }

  private async subjectExists(type: ReportSubjectType, id: string): Promise<boolean> {
    switch (type) {
      case 'post':
        return (await this.posts.findById(id)) !== null;
      // A description is reported by its interest's id: there is one description
      // per interest, so a separate id would be a second name for the same thing.
      case 'interest':
      case 'interest-description':
        return this.catalogue.byId(id) !== undefined;
      case 'comment':
        return this.commentExists(id);
      case 'place':
        return (await this.places.find(id)) !== null;
      case 'message':
        // A message id alone does not locate a message - it lives in a
        // conversation partition. The reporter supplies `<conversationId>:<messageId>`,
        // which is also the only form a participant can produce, so an outsider
        // cannot fish for message ids by reporting them.
        return this.messageExists(id);
      // 005/FR-014. Same reasoning as a message: a review lives in its place's
      // partition and is identified by its author, so `<placeId>:<userId>` is
      // both the only form that locates one and the only form a reader can
      // produce from what the place page showed them.
      case 'review':
        return this.reviewExists(id);
    }
  }

  private async reviewExists(compositeId: string): Promise<boolean> {
    const [placeId, userId] = compositeId.split(':');
    if (!placeId || !userId) return false;
    const review = await this.ratings.find(placeId, userId);
    // An already-removed review is not reportable again. Reporting one would
    // create a queue item whose subject is invisible to the moderator who has to
    // decide on it.
    return review !== null && !review.removedByModeration;
  }

  private async messageExists(compositeId: string): Promise<boolean> {
    const [conversationId, messageId] = compositeId.split(':');
    if (!conversationId || !messageId) return false;
    return (await this.messages.find(conversationId, messageId)) !== null;
  }

  private async commentExists(commentId: string): Promise<boolean> {
    // Comment ids are ULIDs scoped to a post; the id alone is enough to accept
    // the report, and moderation resolves the full item when reviewing.
    return /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(commentId);
  }
}
