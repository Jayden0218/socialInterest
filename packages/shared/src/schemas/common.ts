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
export const notificationKindSchema = z.enum(['reaction', 'comment', 'follow']);

/**
 * FR-035: paging is cursor-based and position-preserving. Offsets are deliberately
 * not supported - they lose position when items are inserted mid-scroll.
 */
export const pageQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

/** FR-036: every empty feed or interest space names which empty state to show. */
export const emptyStateHintSchema = z.enum([
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
