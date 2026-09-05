import type { InterestRef } from '@sih/shared';
import { labelWithParent } from './InterestScreen';

/**
 * FR-026: results appear as the person types, across both levels, each
 * sub-interest labelled with its parent - "portraits" under Photography must be
 * distinguishable from "portraits" under Painting.
 */
export const TYPEAHEAD_DEBOUNCE_MS = 150;
export const MIN_QUERY_LENGTH = 1;

export function shouldQuery(input: string): boolean {
  return input.trim().length >= MIN_QUERY_LENGTH;
}

export function resultLabel(ref: InterestRef): string {
  return labelWithParent(ref);
}

export function InterestSearchScreen() {
  return null;
}
