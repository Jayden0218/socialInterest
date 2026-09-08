import { Switch, Text, TextInput, View } from 'react-native';
import { activePalette as palette, radius, space, textStyle } from '../../ui/theme';
import { Banner, Button, Row, Screen } from '../../ui/primitives';

import type { NotificationPrefs } from '../../data/session';
import { NOTIFICATION_CATEGORIES } from '../notifications/NotificationsScreen';

export type { NotificationPrefs };

export interface ProfileDraft {
  displayName: string;
  bio: string;
  notificationPrefs: NotificationPrefs;
}

/**
 * FR-002, FR-049. Preferences are sent as a partial patch and merged server
 * side, so toggling one category cannot silently reset the others.
 */
export function canSaveProfile(draft: ProfileDraft): boolean {
  return draft.displayName.trim().length > 0 && draft.displayName.length <= 50 && draft.bio.length <= 300;
}

/** FR-003. Deletion is not reversible, so the confirmation states the outcome. */
export const DELETE_ACCOUNT_CONFIRMATION =
  'Your posts will be removed and your comments anonymised. This cannot be undone.';

/**
 * ONE list, imported - this screen used to keep a private copy of it.
 *
 * The copy had three categories. NOTIFICATION_CATEGORIES has four: 004/FR-031
 * added `message` and added it to the list in NotificationsScreen, which
 * DESCRIBES notifications, not the one that renders the switches. So the
 * control FR-031 is about did not exist in the UI on any platform, and the
 * requirement was reported complete.
 *
 * Found by 18-notification-settings on an Android device, the first time that
 * flow ever reached the screen. Nothing else could see it: the mobile tests
 * render this screen with props and assert what IS there, and two lists that
 * disagree are invisible to a test that only reads one of them. It is the same
 * shape as the feed's second hand-rolled responder - the duplicate is not a
 * risk of drift, it IS the drift.
 */
const CATEGORIES = NOTIFICATION_CATEGORIES;

/**
 * 007/FR-011 AND FR-012 — "YOUR FEED", and it is a release gate, not a setting.
 *
 * The composed feed was legible because you BUILT it: your subscriptions were
 * visible and you could change them. A ranked feed is built from behaviour, so
 * the equivalent legibility has to be given back deliberately — see what it
 * learned, and be able to throw it away. Constitution 2.0.0 makes this ship
 * with US1 or US1 does not ship.
 *
 * This is also the ONLY place the product explains its ranking. FR-010 forbids
 * a per-post "why am I seeing this" on any browse or post surface: an
 * explanation attached to each post is an invitation to argue with the feed
 * post by post, and it is the pattern the owner rejected by name.
 */
export interface FeedSignalSummary {
  interests: { interestId: string; name: string; weight: number }[];
  collected: string[];
}

export function EditProfileScreen({
  draft,
  saving,
  feedSignals,
  clearingSignals,
  onChange,
  onSave,
  onClearFeedSignals,
  onDeleteAccount,
}: {
  draft: ProfileDraft;
  saving?: boolean;
  /** FR-011. Absent while it loads, and absent in tests that do not need it. */
  feedSignals?: FeedSignalSummary | null;
  clearingSignals?: boolean;
  onChange: (next: ProfileDraft) => void;
  onSave: () => void;
  onClearFeedSignals?: () => void;
  onDeleteAccount: () => void;
}) {
  return (
    <Screen testID="edit-profile-screen">
      <TextInput
        testID="display-name-input"
        accessibilityLabel="Display name"
        value={draft.displayName}
        onChangeText={(displayName) => onChange({ ...draft, displayName })}
        maxLength={50}
        style={{
          borderWidth: 1,
          borderColor: palette.line.hairline,
          borderRadius: radius.md,
          padding: space.md,
          ...textStyle.body,
          color: palette.text.primary,
        }}
      />
      <TextInput
        testID="bio-input"
        accessibilityLabel="Bio"
        value={draft.bio}
        onChangeText={(bio) => onChange({ ...draft, bio })}
        multiline
        maxLength={300}
        style={{
          borderWidth: 1,
          borderColor: palette.line.hairline,
          borderRadius: radius.md,
          padding: space.md,
          minHeight: 72,
          ...textStyle.body,
          color: palette.text.primary,
        }}
      />

      <View testID="notification-prefs" style={{ gap: space.sm }}>
        <Text style={{ ...textStyle.caption, color: palette.text.muted }}>Notify me about</Text>
        {CATEGORIES.map((c) => (
          <Row key={c.key} style={{ justifyContent: 'space-between' }}>
            <Text style={{ ...textStyle.body, color: palette.text.primary }}>{c.label}</Text>
            <Switch
              testID={`pref-${c.key}`}
              accessibilityLabel={c.label}
              value={draft.notificationPrefs[c.key]}
              onValueChange={(value) =>
                // Only the toggled key changes; the server merges the rest.
                onChange({ ...draft, notificationPrefs: { ...draft.notificationPrefs, [c.key]: value } })
              }
            />
          </Row>
        ))}
      </View>

      {feedSignals ? (
        <View testID="feed-signals" style={{ gap: space.sm }}>
          <Text style={{ ...textStyle.caption, color: palette.text.muted }}>Your feed</Text>
          <Text testID="feed-signals-summary" style={{ ...textStyle.body, color: palette.text.primary }}>
            {feedSignals.interests.length > 0
              ? `Built from ${feedSignals.interests.map((i) => i.name).join(', ')}.`
              : 'Your feed has not learned anything yet.'}
          </Text>
          <Text testID="feed-signals-collected" style={{ ...textStyle.caption, color: palette.text.muted }}>
            {/* In the person's own terms, not in the ranker's. */}
            {`From ${feedSignals.collected.join(', ')}.`}
          </Text>
          {onClearFeedSignals ? (
            <Button
              testID="clear-feed-signals"
              label={clearingSignals ? 'Clearing…' : 'Clear what my feed has learned'}
              variant="secondary"
              disabled={clearingSignals === true}
              onPress={onClearFeedSignals}
            />
          ) : null}
        </View>
      ) : null}

      <Button
        testID="save-profile"
        label={saving ? 'Saving…' : 'Save'}
        disabled={!canSaveProfile(draft) || saving === true}
        onPress={onSave}
      />

      <Banner tone="danger" testID="delete-account-warning">{DELETE_ACCOUNT_CONFIRMATION}</Banner>
      <Button testID="delete-account" label="Delete account" variant="danger" onPress={onDeleteAccount} />
    </Screen>
  );
}
