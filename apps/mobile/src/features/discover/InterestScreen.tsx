import type { Interest, InterestRef } from '@sih/shared';

export interface InterestScreenData {
  interest: Interest;
  /** Present only for a top-level interest (FR-020). */
  subInterests?: Interest[];
  /** Sub-interests whose posts are rolled up into this listing (FR-024). */
  rollsUpFrom: string[];
}

/**
 * FR-025. Opening a top-level interest shows its sub-interests AND a combined
 * view of their posts; opening a sub-interest shows only its own.
 */
export function isRollUpView(data: InterestScreenData): boolean {
  return data.interest.level === 'top' && data.rollsUpFrom.length > 0;
}

/** Explains where rolled-up posts came from, so the listing is not surprising. */
export function rollUpCaption(data: InterestScreenData): string | null {
  if (!isRollUpView(data)) return null;
  const n = data.rollsUpFrom.length;
  return `Including posts from ${n} sub-interest${n === 1 ? '' : 's'}`;
}

export function labelWithParent(ref: InterestRef): string {
  return ref.parent ? `${ref.name} · ${ref.parent.name}` : ref.name;
}

export function InterestScreen() {
  return null;
}
