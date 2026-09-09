import { z } from 'zod';
import {
  handleSchema,
  interestLevelSchema,
  interestStateSchema,
  notificationKindSchema,
  placeCategorySchema,
  conversationStateSchema,
  processingStateSchema,
  visibilitySchema,
} from '../schemas/common';

export const interestRefSchema: z.ZodType<InterestRef> = z.lazy(() =>
  z.object({
    interestId: z.string(),
    name: z.string(),
    slug: z.string(),
    level: interestLevelSchema,
    /** Present for sub-interests so search results disambiguate (FR-026). */
    parent: interestRefSchema.nullable().optional(),
  }),
);
export interface InterestRef {
  interestId: string;
  name: string;
  slug: string;
  level: z.infer<typeof interestLevelSchema>;
  parent?: InterestRef | null;
}

export const interestSchema = z.object({
  interestId: z.string(),
  name: z.string().min(2).max(50),
  slug: z.string(),
  level: interestLevelSchema,
  parentId: z.string().nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  postCount: z.number().int().nonnegative(),
  followerCount: z.number().int().nonnegative(),
  state: interestStateSchema,
  viewerIsFollowing: z.boolean().optional(),
});
export type Interest = z.infer<typeof interestSchema>;

export const publicProfileSchema = z.object({
  userId: z.string(),
  handle: handleSchema,
  displayName: z.string().min(1).max(50),
  avatarUrl: z.string().nullable().optional(),
  bio: z.string().max(300).nullable().optional(),
  followerCount: z.number().int().nonnegative().optional(),
  followingCount: z.number().int().nonnegative().optional(),
  topInterests: z.array(interestRefSchema).optional(),
  viewerIsFollowing: z.boolean().optional(),
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

export const mediaItemSchema = z.object({
  kind: z.enum(['image', 'video']),
  processingState: processingStateSchema,
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().positive().nullable().optional(),
  /** FR-009: shown before playback begins. */
  posterUrl: z.string().nullable().optional(),
  renditions: z.record(z.string()).optional(),
  /** FR-010: set only by the server-side processor; gates `ready`. */
  exifStripped: z.boolean().optional(),
});
export type MediaItem = z.infer<typeof mediaItemSchema>;

// ---------------------------------------------------------------- feature 004

export const placeSummarySchema = z.object({
  placeId: z.string(),
  name: z.string().min(1).max(120),
  category: placeCategorySchema,
  locality: z.string().min(1).max(120),
  postCount: z.number().int().nonnegative().optional(),
});
export type PlaceSummary = z.infer<typeof placeSummarySchema>;

// ---------------------------------------------------------------- feature 005

/**
 * 005/FR-004, FR-005.
 *
 * `average` is NULL when `count` is 0, never 0. "Nobody has rated this" and
 * "everybody rated this 0" are different facts, and 0 is not even a legal score -
 * a zero here would be a value every client had to know to special-case, which is
 * how a display bug becomes everyone's problem.
 */
export const placeRatingSummarySchema = z.object({
  average: z.number().min(1).max(5).nullable(),
  count: z.number().int().nonnegative(),
});
export type PlaceRatingSummary = z.infer<typeof placeRatingSummarySchema>;

/** 005/FR-001, FR-008. The rating is required; the text is not. */
export const ratingWriteSchema = z.object({
  score: z.number().int().min(1).max(5),
  body: z.string().max(2000).nullable().optional(),
});
export type RatingWrite = z.infer<typeof ratingWriteSchema>;

/**
 * A review as a client receives it.
 *
 * `author` is a HYDRATED profile, not an id. Six surfaces in this codebase have
 * shipped returning raw candidate rows because nothing asserted the response
 * shape; this schema is what apps/e2e/journeys/response-shape.spec.ts checks
 * reviews against.
 *
 * There is deliberately no `visibility` field. A review has no audience setting -
 * it is as visible as the place page it sits on - and inventing one to satisfy a
 * type signature is the defect research R4 exists to avoid.
 */
export const reviewSchema = z.object({
  placeId: z.string(),
  author: publicProfileSchema,
  score: z.number().int().min(1).max(5),
  body: z.string().max(2000).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Review = z.infer<typeof reviewSchema>;

export const placeSchema = placeSummarySchema.extend({
  address: z.string().max(240).nullable().optional(),
  status: z.enum(['active', 'merged', 'retired']),
  mergedIntoPlaceId: z.string().nullable().optional(),
  followerCount: z.number().int().nonnegative(),
  viewerIsFollowing: z.boolean().optional(),
  /** Derived from the posts filed here, never authored. */
  interests: z.array(interestRefSchema).optional(),
  /** 005/FR-004. Optional so a place written before 005 still parses. */
  ratingSummary: placeRatingSummarySchema.optional(),
  /** 005/FR-002. The viewer's own rating, so the control renders in the right state. */
  viewerRating: z.number().int().min(1).max(5).nullable().optional(),
});
export type Place = z.infer<typeof placeSchema>;

export const postSchema = z.object({
  /** 008/FR-030. The user ids the caption names, resolved at write time. */
  mentions: z.array(z.string()).optional(),
  postId: z.string(),
  author: publicProfileSchema,
  caption: z.string().max(2000).nullable().optional(),
  /** FR-006: never empty. */
  interests: z.array(interestRefSchema).min(1),
  visibility: visibilitySchema,
  processingState: processingStateSchema,
  mediaKind: z.enum(['images', 'video']),
  media: z.array(mediaItemSchema).optional(),
  reactionCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  viewerHasReacted: z.boolean().optional(),
  /**
   * 004/FR-023. The place the author attached, if any.
   *
   * NEVER derived from media metadata (FR-021): 001/FR-010 strips embedded
   * location and this discloses it on purpose, and the two must not meet.
   */
  place: placeSummarySchema.nullable().optional(),
  /** 004/FR-037. */
  viewerHasSaved: z.boolean().optional(),
  createdAt: z.string(),
});
export type Post = z.infer<typeof postSchema>;

export const commentSchema = z.object({
  commentId: z.string(),
  author: publicProfileSchema,
  /**
   * 008/FR-026. NULL when a moderator removed it.
   *
   * The row survives so the thread keeps its shape and every reply keeps its
   * parent; the body does not. Nullable rather than a placeholder sentence, so
   * no two surfaces can word the removal differently.
   */
  body: z.string().min(1).max(1000).nullable(),
  moderationState: z.enum(['removed']).nullable().optional(),
  /** 008/FR-023. The comment this one answers; null for a top-level one. */
  parentCommentId: z.string().nullable().optional(),
  /**
   * 008/FR-030. The people this text names, RESOLVED AT WRITE TIME.
   *
   * User ids rather than handles: a handle change would otherwise re-point an
   * old mention at whoever holds it now (research R9).
   */
  mentions: z.array(z.string()).optional(),
  /**
   * 008/FR-027. WHEN it was edited, and its presence IS "marked as edited".
   *
   * A boolean beside a timestamp is two fields for one fact, which is how they
   * come to disagree — the same argument `anonymisedAt` and 005's message
   * `editedAt` already make.
   */
  editedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type Comment = z.infer<typeof commentSchema>;

export const notificationSchema = z.object({
  notificationId: z.string(),
  kind: notificationKindSchema,
  actor: publicProfileSchema,
  postId: z.string().nullable().optional(),
  /**
   * 007/T053 - the thumbnail `Activity.dc.html` shows beside a post row.
   *
   * Costs no extra read: `listVisible` ALREADY fetches each post through
   * `PostQueryService` to decide whether the notification survived the post
   * being deleted or restricted, and threw the result away. So this is the
   * post the viewer has already been judged able to see, and the url is
   * presigned inside `toMediaItem` - after `VisibilityFilter` decided, never
   * before (006/R4b).
   *
   * Null for a follow, for a post with no ready media, and for a video with no
   * poster frame yet.
   */
  postThumbUrl: z.string().nullable().optional(),
  createdAt: z.string(),
  readAt: z.string().nullable().optional(),
});
export type Notification = z.infer<typeof notificationSchema>;

// ------------------------------- feature 004, continued
//
// These come AFTER postSchema because messageSchema references it: a shared post
// is resolved per reader and embedded in the response, never denormalised into
// the message row.

export const conversationSummarySchema = z.object({
  conversationId: z.string(),
  /**
   * 005: NULLABLE, because a group has no single other person.
   *
   * Kept populated for every pair conversation, so a client written against the
   * 004 contract still finds what it expects there (005/FR-026). A group sends
   * `null` and identifies itself by `name` or `participants` instead.
   */
  other: publicProfileSchema.nullable(),
  state: conversationStateSchema,
  lastMessageAt: z.string(),
  lastMessagePreview: z.string().max(140).nullable().optional(),
  unreadCount: z.number().int().nonnegative(),
  /**
   * 005/R1. EXPLICIT, not inferred from participant count: a pair derives its id
   * by hashing the sorted pair and a group gets a ULID, so a length check would
   * be a second way to answer a question the id scheme already answers - and the
   * two answers could disagree.
   */
  kind: z.enum(['pair', 'group']).optional(),
  /** 005/FR-024. User-generated content: reportable, moderatable. */
  name: z.string().max(60).nullable().optional(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

/** 005/FR-025. Membership is stored, never derived from the conversation id. */
export const conversationParticipantSchema = z.object({
  person: publicProfileSchema,
  state: conversationStateSchema,
  joinedAt: z.string(),
  leftAt: z.string().nullable().optional(),
});
export type ConversationParticipant = z.infer<typeof conversationParticipantSchema>;

export const conversationSchema = conversationSummarySchema.extend({
  /** Decided by ConversationAccess on the server, never by the client. */
  viewerCanSend: z.boolean(),
  initiatedByViewer: z.boolean(),
  /** 005: at most 20 (research R3 - a transactional limit, not a preference). */
  participants: z.array(conversationParticipantSchema).max(20).optional(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const messageSchema = z.object({
  messageId: z.string(),
  authorId: z.string(),
  body: z.string().max(2000).nullable().optional(),
  createdAt: z.string(),
  moderationState: z.enum(['visible', 'removed']),
  sharedPostId: z.string().nullable().optional(),
  /**
   * Resolved PER READER through the post visibility boundary. Null when the
   * reader may not see it - the message itself is still returned, because
   * conversation access and post visibility are two decisions, not one.
   */
  sharedPost: postSchema.nullable().optional(),
  sharedPostUnavailableReason: z.enum(['gone', 'not-for-you']).nullable().optional(),
});
export type Message = z.infer<typeof messageSchema>;

/** Absent means on. `message` is new in 004; the other three ship in 001. */
export const notificationPreferencesSchema = z.object({
  reaction: z.boolean().optional(),
  comment: z.boolean().optional(),
  follow: z.boolean().optional(),
  message: z.boolean().optional(),
  /** 008/FR-031. Added HERE and to the list the Edit-profile screen renders. */
  mention: z.boolean().optional(),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
