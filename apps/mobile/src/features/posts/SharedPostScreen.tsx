import type { Post } from '@sih/shared';
import { Screen } from '../../ui/primitives';
import { EmptyState } from '../../ui/primitives';
import { PostDetailScreen } from './PostDetailScreen';

/**
 * The landing state for a share link opened while signed out.
 *
 * A public post renders in full with a join prompt (FR-042 scenario 3). Anything
 * else shows a message that does not reveal whether the post exists: "not
 * available to you" for a visibility exclusion, and "no longer available" for
 * BOTH deletion and a block, which must stay indistinguishable — a distinct
 * message for a block would disclose it to the person it was placed against.
 */
export type SharedPostOutcome = { kind: 'visible' } | { kind: 'not_for_you' } | { kind: 'gone' };

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

export function SharedPostScreen({
  status,
  post,
  onJoin,
}: {
  status: number;
  post?: Post;
  onJoin: () => void;
}) {
  const outcome = outcomeForStatus(status);
  const copy = copyFor(outcome);

  if (outcome.kind !== 'visible' || !post) {
    return (
      <Screen testID="shared-post-screen">
        <EmptyState testID="shared-post-unavailable" title={copy.title} body={copy.body} />
      </Screen>
    );
  }

  return (
    <Screen testID="shared-post-screen">
      <PostDetailScreen post={post} />
      <EmptyState testID="join-prompt" title="" body="" actionLabel={copy.cta} onAction={onJoin} />
    </Screen>
  );
}
