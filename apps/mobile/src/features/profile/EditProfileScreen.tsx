import { Switch, Text, TextInput, View } from 'react-native';
import { activePalette as palette, radius, space, type } from '../../ui/theme';
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

export function EditProfileScreen({
  draft,
  saving,
  onChange,
  onSave,
  onDeleteAccount,
}: {
  draft: ProfileDraft;
  saving?: boolean;
  onChange: (next: ProfileDraft) => void;
  onSave: () => void;
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
          fontSize: type.body.size,
          lineHeight: type.body.lineHeight,
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
          fontSize: type.body.size,
          lineHeight: type.body.lineHeight,
          color: palette.text.primary,
        }}
      />

      <View testID="notification-prefs" style={{ gap: space.sm }}>
        <Text style={{ fontSize: type.caption.size,
 lineHeight: type.caption.lineHeight, color: palette.text.muted }}>Notify me about</Text>
        {CATEGORIES.map((c) => (
          <Row key={c.key} style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontSize: type.body.size,
 lineHeight: type.body.lineHeight, color: palette.text.primary }}>{c.label}</Text>
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
