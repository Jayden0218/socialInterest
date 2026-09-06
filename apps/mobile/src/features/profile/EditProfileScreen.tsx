import { Switch, Text, TextInput, View } from 'react-native';
import { theme } from '../../ui/theme';
import { Banner, Button, Row, Screen } from '../../ui/primitives';

import type { NotificationPrefs } from '../../data/session';

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

const CATEGORIES: { key: keyof NotificationPrefs; label: string }[] = [
  { key: 'reaction', label: 'Reactions to your posts' },
  { key: 'comment', label: 'Comments on your posts' },
  { key: 'follow', label: 'New followers' },
];

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
          borderColor: theme.color.border,
          borderRadius: theme.radius.md,
          padding: theme.space.md,
          fontSize: theme.font.md,
          color: theme.color.text,
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
          borderColor: theme.color.border,
          borderRadius: theme.radius.md,
          padding: theme.space.md,
          minHeight: 72,
          fontSize: theme.font.md,
          color: theme.color.text,
        }}
      />

      <View testID="notification-prefs" style={{ gap: theme.space.sm }}>
        <Text style={{ fontSize: theme.font.sm, color: theme.color.muted }}>Notify me about</Text>
        {CATEGORIES.map((c) => (
          <Row key={c.key} style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontSize: theme.font.md, color: theme.color.text }}>{c.label}</Text>
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
