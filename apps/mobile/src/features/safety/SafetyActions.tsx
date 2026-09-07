import { Pressable, Text, View } from 'react-native';
import { touchTarget, theme } from '../../ui/theme';
import { Banner, Button, Screen } from '../../ui/primitives';

/**
 * Every user-generated thing a person can report.
 *
 * 004/FR-042 adds three, and they arrive in the SAME release as the content
 * they cover - Constitution IV names safety deferred as safety cancelled.
 */
export type ReportSubject =
  | 'post'
  | 'comment'
  | 'interest'
  | 'message'
  | 'place'
  | 'interest-description'
  // 005/FR-014. A review is user-generated text on a page every visitor sees,
  // so it is reportable on the same path as everything else here.
  | 'review';

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'explicit', label: 'Explicit content' },
  { value: 'violence', label: 'Violence' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'other', label: 'Something else' },
] as const;

/**
 * FR-043. Interest NAMES are reportable, not only posts and comments — an
 * interest name is content every visitor to that space sees. The action must be
 * reachable from the interest header, or the route to a human does not exist in
 * practice however well it works in the API.
 */
export function reportActionLabel(subject: ReportSubject): string {
  switch (subject) {
    case 'post':
      return 'Report this post';
    case 'comment':
      return 'Report this comment';
    case 'interest':
      return 'Report this interest name';
    case 'interest-description':
      return 'Report this description';
    case 'message':
      return 'Report this message';
    case 'place':
      return 'Report this place';
    case 'review':
      return 'Report this review';
  }
}

/**
 * FR-044. Blocking is described accurately: it is mutual and it severs the
 * follow, which surprises people who expect it to be one-way and reversible.
 */
export const BLOCK_CONFIRMATION =
  'You will not see each other’s posts, and any follow between you will be removed. ' +
  'Unblocking later does not restore the follow.';

export function SafetyActions({
  subject,
  selectedReason,
  onSelectReason,
  onReport,
  onBlock,
}: {
  subject: ReportSubject;
  selectedReason: string | null;
  onSelectReason: (reason: string) => void;
  onReport: () => void;
  onBlock?: () => void;
}) {
  return (
    <Screen testID="safety-actions">
      <Text style={{ fontSize: theme.font.lg, fontWeight: '600', color: theme.color.text }}>
        {reportActionLabel(subject)}
      </Text>

      <View testID="report-reasons" style={{ gap: theme.space.sm }}>
        {REPORT_REASONS.map((r, i) => (
          <Pressable
            key={r.value}
            testID={`report-reason-${i}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedReason === r.value }}
            onPress={() => onSelectReason(r.value)}
            style={{
        ...touchTarget,
              padding: theme.space.md,
              borderWidth: 1,
              borderRadius: theme.radius.md,
              borderColor: selectedReason === r.value ? theme.color.accent : theme.color.border,
            }}
          >
            <Text style={{ fontSize: theme.font.md, color: theme.color.text }}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      <Button
        testID="submit-report"
        label="Send report"
        disabled={selectedReason === null}
        onPress={onReport}
      />

      {onBlock ? (
        <View style={{ gap: theme.space.sm }}>
          <Banner tone="warning" testID="block-confirmation">{BLOCK_CONFIRMATION}</Banner>
          <Button testID="block-person" label="Block this person" variant="danger" onPress={onBlock} />
        </View>
      ) : null}
    </Screen>
  );
}
