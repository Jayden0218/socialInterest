import { Pressable, Text } from 'react-native';
import { theme } from '../../ui/theme';
import { Row } from '../../ui/primitives';

export interface EngagementState {
  reactionCount: number;
  commentCount: number;
  viewerHasReacted: boolean;
}

/**
 * FR-039. The server is idempotent, so the optimistic update can be too: a
 * double-tap toggles rather than accumulating, and a failed request rolls back
 * to the server's number rather than to a guessed one.
 */
export function optimisticToggle(state: EngagementState): EngagementState {
  return state.viewerHasReacted
    ? { ...state, viewerHasReacted: false, reactionCount: Math.max(0, state.reactionCount - 1) }
    : { ...state, viewerHasReacted: true, reactionCount: state.reactionCount + 1 };
}

export function reconcile(state: EngagementState, server: Partial<EngagementState>): EngagementState {
  return { ...state, ...server };
}

export function EngagementBar({
  state,
  pending,
  onReact,
  onOpenComments,
  onShare,
}: {
  state: EngagementState;
  pending?: boolean;
  onReact: () => void;
  onOpenComments: () => void;
  onShare: () => void;
}) {
  return (
    <Row style={{ gap: theme.space.lg }}>
      <Pressable
        testID="react-button"
        accessibilityRole="button"
        accessibilityState={{ selected: state.viewerHasReacted }}
        accessibilityLabel={state.viewerHasReacted ? 'Remove reaction' : 'React'}
        onPress={onReact}
      >
        <Text style={{ color: state.viewerHasReacted ? theme.color.accent : theme.color.muted, fontSize: theme.font.md }}>
          {state.viewerHasReacted ? '♥' : '♡'} {state.reactionCount}
          {/* Queued offline actions show as pending, never as landed. */}
          {pending ? ' ·' : ''}
        </Text>
      </Pressable>

      <Pressable testID="comments-button" accessibilityRole="button" onPress={onOpenComments}>
        <Text style={{ color: theme.color.muted, fontSize: theme.font.md }}>💬 {state.commentCount}</Text>
      </Pressable>

      <Pressable testID="share-button" accessibilityRole="button" accessibilityLabel="Share" onPress={onShare}>
        <Text style={{ color: theme.color.muted, fontSize: theme.font.md }}>↗</Text>
      </Pressable>
    </Row>
  );
}
