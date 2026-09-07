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

export const placeSchema = placeSummarySchema.extend({
  address: z.string().max(240).nullable().optional(),
  status: z.enum(['active', 'merged', 'retired']),
  mergedIntoPlaceId: z.string().nullable().optional(),
  followerCount: z.number().int().nonnegative(),
  viewerIsFollowing: z.boolean().optional(),
  /** Derived from the posts filed here, never authored. */
  interests: z.array(interestRefSchema).optional(),
});
export type Place = z.infer<typeof placeSchema>;

export const postSchema = z.object({
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
  body: z.string().min(1).max(1000),
  createdAt: z.string(),
});
export type Comment = z.infer<typeof commentSchema>;

export const notificationSchema = z.object({
  notificationId: z.string(),
  kind: notificationKindSchema,
  actor: publicProfileSchema,
  postId: z.string().nullable().optional(),
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
  other: publicProfileSchema,
  state: conversationStateSchema,
  lastMessageAt: z.string(),
  lastMessagePreview: z.string().max(140).nullable().optional(),
  unreadCount: z.number().int().nonnegative(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const conversationSchema = conversationSummarySchema.extend({
  /** Decided by ConversationAccess on the server, never by the client. */
  viewerCanSend: z.boolean(),
  initiatedByViewer: z.boolean(),
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
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
