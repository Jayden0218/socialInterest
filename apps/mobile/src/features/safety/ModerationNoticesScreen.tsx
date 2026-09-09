import { Text, TextInput, View } from 'react-native';
import { activePalette as palette, radius, space, textStyle } from '../../ui/theme';
import { Banner, Button, Screen } from '../../ui/primitives';

export interface ModerationNotice {
  actionId: string;
  subjectType: string;
  subjectId: string;
  action: string;
  reason?: string | null;
  timestamp: string;
  appealId?: string | null;
}

export interface Appeal {
  appealId: string;
  subjectKind: string;
  subjectId: string;
  body: string;
  state: 'open' | 'upheld' | 'rejected';
  createdAt: string;
}

/**
 * 008/FR-046 — WHAT THE AUTHOR IS TOLD, IN WORDS THEY DID NOT HAVE TO LEARN.
 *
 * The server sends a subject type, an action and a reported category. Rendering
 * those raw ("post / remove_content / explicit") tells somebody their content
 * was removed in the moderation queue's own vocabulary, which is the shape of
 * being processed rather than being told.
 *
 * Exported so a test can assert the mapping rather than the pixels: an
 * unmapped `action` falls back to the raw value, so a new moderation action
 * shows something true instead of nothing at all.
 */
export function describeNotice(notice: ModerationNotice): string {
  const what =
    { post: 'Your post', comment: 'Your comment', message: 'Your message', review: 'Your review' }[
      notice.subjectType
    ] ?? 'Your content';
  const did =
    { remove_content: 'was removed', appeal_upheld: 'was restored on appeal', appeal_rejected: 'stays removed after appeal' }[
      notice.action
    ] ?? notice.action;
  const why =
    {
      spam: 'reported as spam',
      harassment: 'reported as harassment or bullying',
      explicit: 'reported as explicit content',
      violence: 'reported as violence',
      misinformation: 'reported as misinformation',
      other: 'reported',
    }[notice.reason ?? ''] ?? null;
  return why ? `${what} ${did} after being ${why}.` : `${what} ${did}.`;
}

export function describeAppealState(state: Appeal['state']): string {
  switch (state) {
    case 'open':
      return 'Waiting for a decision';
    case 'upheld':
      return 'Upheld — the removal was reversed';
    case 'rejected':
      return 'Rejected — the removal stands';
  }
}

/**
 * 008/US14 — BEING TOLD, AND BEING ABLE TO DISAGREE.
 *
 * Constitution IV: safety ships with the product. A removal the author is never
 * told about and cannot contest is not moderation, it is disappearance. Before
 * 008 the author of a removed post got a notification from `SYSTEM` carrying no
 * subject and no reason — which is being told that something happened.
 *
 * The appeal box is on the SAME screen as the notice, not behind another
 * navigation step, because a route to a human that takes three taps to find is
 * a route most people do not take.
 */
export function ModerationNoticesScreen({
  notices,
  appeals,
  drafting,
  draftBody,
  submitting,
  error,
  onStartAppeal,
  onDraftChange,
  onSubmitAppeal,
  onCancelAppeal,
}: {
  notices: ModerationNotice[];
  appeals: Appeal[];
  /** The `actionId` currently being appealed, if any. */
  drafting?: string | null;
  draftBody?: string;
  submitting?: boolean;
  error?: string | null;
  onStartAppeal: (actionId: string) => void;
  onDraftChange: (next: string) => void;
  onSubmitAppeal: () => void;
  onCancelAppeal: () => void;
}) {
  const appealFor = (actionId: string): Appeal | undefined =>
    appeals.find((a) => notices.find((n) => n.actionId === actionId)?.appealId === a.appealId);

  return (
    <Screen testID="moderation-notices-screen" scroll>
      <Text style={{ ...textStyle.title, color: palette.text.primary }}>Removed content</Text>

      {error ? <Banner tone="danger" testID="notices-error">{error}</Banner> : null}

      {notices.length === 0 ? (
        /*
          The empty state is the one most people see, and it should read as
          reassurance rather than as a screen that failed to load.
        */
        <Banner tone="info" testID="no-moderation-notices">
          Nothing of yours has been removed.
        </Banner>
      ) : null}

      {notices.map((notice) => {
        const appeal = appealFor(notice.actionId);
        return (
          <View
            key={notice.actionId}
            testID={`moderation-notice-${notice.actionId}`}
            style={{
              gap: space.sm,
              padding: space.lg,
              borderRadius: radius.card,
              backgroundColor: palette.bg.raised,
            }}
          >
            <Text style={{ ...textStyle.body, color: palette.text.primary }}>
              {describeNotice(notice)}
            </Text>
            <Text style={{ ...textStyle.caption, color: palette.text.muted }}>
              {new Date(notice.timestamp).toLocaleDateString()}
            </Text>

            {appeal ? (
              <Text
                testID={`appeal-state-${notice.actionId}`}
                style={{ ...textStyle.caption, color: palette.text.muted }}
              >
                {describeAppealState(appeal.state)}
              </Text>
            ) : notice.appealId ? (
              /*
                The notice says it was appealed but the appeal itself has not
                arrived in this page of the list. Saying so beats offering the
                button again, which would produce a 409 and read as a bug.
              */
              <Text
                testID={`appeal-state-${notice.actionId}`}
                style={{ ...textStyle.caption, color: palette.text.muted }}
              >
                Appealed
              </Text>
            ) : drafting === notice.actionId ? (
              <View style={{ gap: space.sm }}>
                <TextInput
                  testID="appeal-body"
                  accessibilityLabel="Why this should not have been removed"
                  placeholder="Say why this should not have been removed"
                  placeholderTextColor={palette.text.muted}
                  value={draftBody ?? ''}
                  onChangeText={onDraftChange}
                  multiline
                  maxLength={2000}
                  style={{
                    borderWidth: 1,
                    borderColor: palette.line.hairline,
                    borderRadius: radius.md,
                    padding: space.sm,
                    minHeight: 88,
                    color: palette.text.primary,
                    textAlignVertical: 'top',
                    ...textStyle.body,
                  }}
                />
                <Button
                  testID="submit-appeal"
                  label={submitting ? 'Sending…' : 'Send appeal'}
                  disabled={submitting === true || (draftBody ?? '').trim().length === 0}
                  onPress={onSubmitAppeal}
                />
                <Button
                  testID="cancel-appeal"
                  label="Cancel"
                  variant="secondary"
                  onPress={onCancelAppeal}
                />
              </View>
            ) : (
              <Button
                testID={`appeal-${notice.actionId}`}
                label="Appeal this"
                variant="secondary"
                onPress={() => onStartAppeal(notice.actionId)}
              />
            )}
          </View>
        );
      })}
    </Screen>
  );
}
