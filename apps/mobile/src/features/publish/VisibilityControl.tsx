import type { Visibility } from '@sih/shared';

export interface VisibilityControlProps {
  value: Visibility;
  onChange: (next: Visibility) => void;
}

/** FR-013: the default is public, and it is the value the control starts on. */
export const DEFAULT_VISIBILITY: Visibility = 'public';

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: 'public', label: 'Public', hint: 'Anyone can see this, including people who are signed out' },
  { value: 'followers', label: 'Followers', hint: 'Only people who follow you' },
  { value: 'private', label: 'Only me', hint: 'Nobody else can see this' },
];

export function VisibilityControl(_props: VisibilityControlProps) {
  return null;
}
