import type { InterestRef } from '@sih/shared';

export interface InterestSelectorProps {
  selected: InterestRef[];
  onChange: (next: InterestRef[]) => void;
}

/**
 * FR-006: a post must be assigned to at least one interest. The compose screen
 * asks this before enabling publish, so the refusal happens in the UI rather
 * than as a server error the person has to interpret. The server enforces it
 * too - this is convenience, not the guarantee.
 */
export function canPublish(selected: InterestRef[]): boolean {
  return selected.length > 0;
}

export function InterestSelector(_props: InterestSelectorProps) {
  return null;
}
