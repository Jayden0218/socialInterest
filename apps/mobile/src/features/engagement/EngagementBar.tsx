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
  saved,
  onToggleSave,
}: {
  state: EngagementState;
  pending?: boolean;
  onReact: () => void;
  onOpenComments: () => void;
  onShare: () => void;
  /** 004/FR-037. Comes from the SERVER, so the control reflects an answer. */
  saved?: boolean;
  onToggleSave?: () => void;
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

      {/*
        004/FR-037. `saved` is read back from the post, not held locally - the
        react control rendered unreacted on every load for a whole feature
        because nothing told it otherwise.
      */}
      {onToggleSave ? (
        <Pressable
          testID="save-button"
          accessibilityRole="button"
          accessibilityState={{ selected: saved === true }}
          accessibilityLabel={saved ? 'Remove from saved' : 'Save'}
          onPress={onToggleSave}
        >
          <Text style={{ color: saved ? theme.color.accent : theme.color.muted, fontSize: theme.font.md }}>
            {saved ? '★' : '☆'}
          </Text>
        </Pressable>
      ) : null}
    </Row>
  );
}
