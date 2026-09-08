import { Pressable, Switch, Text, View } from 'react-native';
import { activePalette as palette, radius, space, textStyle, MIN_TOUCH_TARGET } from '../../ui/theme';
import { Banner, Button, Field, Row, Screen } from '../../ui/primitives';

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
    /**
     * SCROLLS, ON A MEASUREMENT — 007/T051.
     *
     * `safety-fit.spec.ts` measured this screen at 360x640: Save ends at 124
     * and DELETE ACCOUNT ends at 788, a hundred and forty-eight points below
     * the fold. Two notification switches, the feed-signals disclosure and the
     * account-deletion control were unreachable on a short phone, and were
     * before this rebuild too.
     *
     * Run 36 is why that sentence leads with a number. I turned `scroll` on for
     * seven screens on a "same class of defect" argument and took the device
     * suite from 18/19 to 1/19; the rule that came out of it is not "never
     * scroll" but "only what was measured".
     *
     * Both of run 36's mechanisms are answered here rather than assumed away.
     * `keyboardShouldPersistTaps` is `handled` on `Screen`'s scroll mode, so a
     * tap with the keyboard up is not spent dismissing it. And the submit is in
     * the HEADER now, at y=124 — a keyboard-resized viewport cannot push it
     * below the fold, which was the other candidate mechanism and the one a
     * browser cannot reproduce.
     */
    <Screen testID="edit-profile-screen" padded={false} scroll>
      {/*
        `EditProfile.dc.html` puts Save in the header. `save-profile` keeps its
        testID and its disabled rule; only where it sits changes. Its label is
        "Save", the artboard's word, and it stays a real 44pt target rather than
        the bare text the picture shows.
      */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.lg,
          minHeight: 50,
        }}
      >
        <Text style={{ ...textStyle.title, color: palette.text.primary }}>Edit profile</Text>
        <Pressable
          testID="save-profile"
          accessibilityRole="button"
          accessibilityLabel={saving ? 'Saving' : 'Save profile'}
          accessibilityState={{ disabled: !canSaveProfile(draft) || saving === true }}
          disabled={!canSaveProfile(draft) || saving === true}
          onPress={onSave}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            minWidth: MIN_TOUCH_TARGET,
            justifyContent: 'center',
            alignItems: 'flex-end',
          }}
        >
          <Text
            style={{
              ...textStyle.body,
              fontWeight: '600',
              color:
                !canSaveProfile(draft) || saving === true
                  ? palette.text.muted
                  : palette.intent.accent,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: 14 }}>
        <LabelledField
          label="Name"
          testID="display-name-input"
          accessibilityLabel="Display name"
          value={draft.displayName}
          onChangeText={(displayName) => onChange({ ...draft, displayName })}
          maxLength={50}
        />
        <LabelledField
          label="Bio"
          testID="bio-input"
          accessibilityLabel="Bio"
          value={draft.bio}
          onChangeText={(bio) => onChange({ ...draft, bio })}
          multiline
          maxLength={300}
        />
      </View>

      <View testID="notification-prefs" style={{ gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.lg }}>
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
        <View testID="feed-signals" style={{ gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.lg }}>
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

      <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm }}>
        <Banner tone="danger" testID="delete-account-warning">{DELETE_ACCOUNT_CONFIRMATION}</Banner>
        <Button testID="delete-account" label="Delete account" variant="danger" onPress={onDeleteAccount} />
      </View>
    </Screen>
  );
}

/**
 * The artboard's field: an uppercase label above a boxed input.
 *
 * `Field` is the shared control and keeps the shared behaviour (`bg.sunken`,
 * `radius.field`, the required accessibility label). The label above it is what
 * `EditProfile.dc.html` adds, and it is more than decoration: two adjacent
 * inputs with placeholder-only labels lose their names the moment somebody
 * types, which is the accessibility failure this pattern exists to avoid.
 */
function LabelledField({
  label,
  ...field
}: {
  label: string;
  testID: string;
  accessibilityLabel: string;
  value: string;
  onChangeText: (next: string) => void;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          ...textStyle.caption,
          fontWeight: '600',
          letterSpacing: 0.35,
          color: palette.text.muted,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <Field
        {...field}
        style={{
          borderRadius: radius.card,
          backgroundColor: palette.bg.raised,
          minHeight: field.multiline ? 72 : 46,
          ...(field.multiline ? { textAlignVertical: 'top' as const } : {}),
        }}
      />
    </View>
  );
}
