/**
 * The landing state for a share link opened while signed out.
 *
 * A public post renders in full with a join prompt (FR-042 scenario 3). Anything
 * else shows a message that does not reveal whether the post exists: "not
 * available to you" for a visibility exclusion, and "no longer available" for
 * both deletion AND a block, which must stay indistinguishable.
 */
export type SharedPostOutcome =
  | { kind: 'visible' }
  | { kind: 'not_for_you' }
  | { kind: 'gone' };

export function outcomeForStatus(status: number): SharedPostOutcome {
  if (status === 200) return { kind: 'visible' };
  if (status === 403) return { kind: 'not_for_you' };
  return { kind: 'gone' };
}

export function copyFor(outcome: SharedPostOutcome): { title: string; body: string; cta?: string } {
  switch (outcome.kind) {
    case 'visible':
      return { title: '', body: '', cta: 'Join to follow this interest' };
    case 'not_for_you':
      return {
        title: 'Not available to you',
        body: 'The person who shared this limited who can see it.',
      };
    case 'gone':
      return { title: 'No longer available', body: 'This post may have been deleted.' };
  }
}

export function SharedPostScreen() {
  return null;
}
