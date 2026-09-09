import { Pressable, Text } from 'react-native';
import { activePalette as palette, space, touchTarget, type } from '../../ui/theme';
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
  collections,
  onFile,
}: {
  state: EngagementState;
  pending?: boolean;
  onReact: () => void;
  onOpenComments: () => void;
  onShare: () => void;
  /** 004/FR-037. Comes from the SERVER, so the control reflects an answer. */
  saved?: boolean;
  onToggleSave?: () => void;
  /**
   * 008/FR-049 — WHERE A POST IS FILED, and it has to be somewhere.
   *
   * Collections that could be created and never filled would be this feature's
   * own version of the defect 008 exists to end: a "Following" tab with no feed
   * behind it, `readAt` with no writer, `avatarKey` with no writer. The control
   * sits beside the star because filing is what saving becomes once there are
   * shelves — and it is NOT instead of the star: FR-051 says a filed post is
   * still saved, so both remain.
   */
  collections?: { collectionId: string; name: string }[];
  onFile?: (collectionId: string) => void;
}) {
  return (
    <Row style={{ gap: space.lg }}>
      <Pressable
        style={touchTarget}
        testID="react-button"
        accessibilityRole="button"
        accessibilityState={{ selected: state.viewerHasReacted }}
        accessibilityLabel={state.viewerHasReacted ? 'Remove reaction' : 'React'}
        onPress={onReact}
      >
        <Text style={{ color: state.viewerHasReacted ? palette.intent.accent : palette.text.muted, fontSize: type.body.size }}>
          {state.viewerHasReacted ? '♥' : '♡'} {state.reactionCount}
          {/* Queued offline actions show as pending, never as landed. */}
          {pending ? ' ·' : ''}
        </Text>
      </Pressable>

      <Pressable
        style={touchTarget} testID="comments-button" accessibilityRole="button" onPress={onOpenComments}>
        <Text style={{ color: palette.text.muted, fontSize: type.body.size }}>💬 {state.commentCount}</Text>
      </Pressable>

      <Pressable
        style={touchTarget} testID="share-button" accessibilityRole="button" accessibilityLabel="Share" onPress={onShare}>
        <Text style={{ color: palette.text.muted, fontSize: type.body.size }}>↗</Text>
      </Pressable>

      {/*
        004/FR-037. `saved` is read back from the post, not held locally - the
        react control rendered unreacted on every load for a whole feature
        because nothing told it otherwise.
      */}
      {onToggleSave ? (
        <Pressable
        style={touchTarget}
          testID="save-button"
          accessibilityRole="button"
          accessibilityState={{ selected: saved === true }}
          accessibilityLabel={saved ? 'Remove from saved' : 'Save'}
          onPress={onToggleSave}
        >
          <Text style={{ color: saved ? palette.intent.accent : palette.text.muted, fontSize: type.body.size }}>
            {saved ? '★' : '☆'}
          </Text>
        </Pressable>
      ) : null}

      {collections && onFile && collections.length > 0
        ? collections.map((c) => (
            <Pressable
              key={c.collectionId}
              style={touchTarget}
              testID={`file-into-${c.collectionId}`}
              accessibilityRole="button"
              accessibilityLabel={`Add to ${c.name}`}
              onPress={() => onFile(c.collectionId)}
            >
              <Text style={{ color: palette.text.muted, fontSize: type.body.size }}>
                {`+ ${c.name}`}
              </Text>
            </Pressable>
          ))
        : null}
    </Row>
  );
}
