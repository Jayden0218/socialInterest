import { z } from 'zod';

/** FR-013..FR-016. Defaults to public on creation (FR-013). */
export const visibilitySchema = z.enum(['public', 'followers', 'private']);
export type Visibility = z.infer<typeof visibilitySchema>;

/** FR-009. Only `ready` posts are visible to anyone but the author. */
export const processingStateSchema = z.enum(['pending', 'processing', 'ready', 'failed']);
export type ProcessingState = z.infer<typeof processingStateSchema>;

export const interestLevelSchema = z.enum(['top', 'sub']);
export type InterestLevel = z.infer<typeof interestLevelSchema>;

export const interestStateSchema = z.enum(['active', 'merging', 'merged', 'retired']);
export const personStatusSchema = z.enum(['active', 'deleting', 'deleted']);
export const reportStateSchema = z.enum(['open', 'under_review', 'actioned', 'dismissed']);
export const reportSubjectSchema = z.enum(['post', 'comment', 'interest']);
export const notificationKindSchema = z.enum(['reaction', 'comment', 'follow', 'message']);

/** 004/FR-013. A restaurant is a CATEGORY, not the entity - see research R3. */
export const placeCategorySchema = z.enum([
  'restaurant',
  'cafe',
  'bar',
  'shop',
  'venue',
  'outdoor',
  'other',
]);
export type PlaceCategory = z.infer<typeof placeCategorySchema>;

/**
 * `left` is 005/FR-021 and belongs to a PARTICIPANT, not a conversation.
 *
 * The other four are values a whole pair conversation can hold. `left` never is:
 * one person leaving a group of four does not put the conversation in a state,
 * it puts that participation in one. Research R2 is the reason state moved to
 * the participant at all - a group has no single value that is not a lie about
 * somebody.
 */
export const conversationStateSchema = z.enum([
  'requested',
  'accepted',
  'declined',
  'severed',
  'left',
]);
export type ConversationState = z.infer<typeof conversationStateSchema>;

/**
 * FR-035: paging is cursor-based and position-preserving. Offsets are deliberately
 * not supported - they lose position when items are inserted mid-scroll.
 */
export const pageQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

/**
 * FR-036: every empty feed or interest space names which empty state to show.
 *
 * `no_followed_interests` is RETIRED by 007 and kept in the enum on purpose.
 * The home feed can no longer produce it - a ranked feed is never in that state
 * - but a stored or in-flight response from before the change still parses,
 * and a client that still branches on it simply never takes that branch.
 * Removing the member would turn an old value into a parse error, which is a
 * louder failure than the one it prevents.
 */
export const emptyStateHintSchema = z.enum([
  /** @deprecated 007 - the composed feed's state. Never emitted any more. */
  'no_followed_interests',
  'interest_has_no_posts',
  'no_posts_yet',
  'no_results',
]);

export const pageMetaSchema = z.object({
  nextCursor: z.string().nullable(),
  emptyStateHint: emptyStateHintSchema.nullable().optional(),
});
export type PageMeta = z.infer<typeof pageMetaSchema>;

export const pageOf = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), page: pageMetaSchema });

export const handleSchema = z.string().regex(/^[a-z0-9_]{3,30}$/);
