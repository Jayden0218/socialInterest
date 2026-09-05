import { z } from 'zod';
import {
  handleSchema,
  interestLevelSchema,
  interestStateSchema,
  notificationKindSchema,
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
