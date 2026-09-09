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
import { ConversationRepository } from '../../persistence/conversation.repository';
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
    @Inject(ConversationRepository) private readonly conversations: ConversationRepository,
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
      // 008/FR-026. `<postId>:<commentId>`, the same composite `message` and
      // `review` use, and for the same reason: a comment id alone does not
      // locate the row, which lives in its post's partition under a sort key
      // carrying `createdAt`.
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
      /**
       * 005/FR-024. A group's NAME, reported by the conversation's id.
       *
       * Only a named group is reportable: there is nothing to moderate about a
       * conversation identified by who is in it, and accepting the report would
       * put an undecidable item in the queue.
       */
      case 'conversation-name': {
        const conversation = await this.conversations.find(id);
        return (
          conversation !== null &&
          conversation.kind === 'group' &&
          !!conversation.name &&
          !conversation.nameRemovedByModeration
        );
      }
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

  /**
   * 008. THIS USED TO BE A REGEX, AND THAT MADE EVERY COMMENT REPORT
   * UN-ACTIONABLE.
   *
   * It read: "the id alone is enough to accept the report, and moderation
   * resolves the full item when reviewing". Moderation could not: a comment
   * lives in its post's partition under `COMMENT#<createdAt>#<id>`, so the id
   * alone locates nothing, and the removal branch for comments did not exist at
   * all. A fabricated id was accepted too — in the same file whose next test
   * says reporting something that does not exist is refused rather than
   * silently queued.
   *
   * Composite and checked now, exactly like `message` and `review`. An
   * already-removed comment is not reportable again, for the reason
   * `reviewExists` gives: it would put an item in the queue whose subject is
   * invisible to the moderator deciding on it.
   */
  private async commentExists(compositeId: string): Promise<boolean> {
    const [postId, commentId] = compositeId.split(':');
    if (!postId || !commentId) return false;
    const comment = await this.comments.findById(postId, commentId);
    return comment !== null && comment.moderationState !== 'removed' && !comment.deletedAt;
  }
}
