import { Pressable, Switch, Text, View } from 'react-native';
import { activePalette as palette, radius, space, textStyle, MIN_TOUCH_TARGET } from '../../ui/theme';
import { Banner, Button, Field, Row, Screen } from '../../ui/primitives';
import { Avatar } from '../../components/Avatar';

import type { NotificationPrefs } from '../../data/session';
import { NOTIFICATION_CATEGORIES } from '../notifications/NotificationsScreen';

export type { NotificationPrefs };

export interface ProfileDraft {
  displayName: string;
  bio: string;
  notificationPrefs: NotificationPrefs;
  /**
   * 008/US5. Needed only so the avatar preview uses the SHARED `Avatar`, whose
   * colour and testID are both seeded from the person's id. Passing a different
   * id here would give the preview a different colour from every other surface,
   * which is the kind of drift one shared component exists to prevent.
   */
  userId: string;
  /**
   * 008/FR-043. `open` or `private`, and absent on the server means `open`.
   *
   * On the DRAFT rather than read from the profile directly, so the switch
   * moves with the same save the rest of this screen uses. A privacy control
   * that applied instantly while every other field waited for Save would be two
   * different contracts on one screen.
   */
  accountPrivacy: 'open' | 'private';
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
  avatarUrl,
  onChangeAvatar,
  onRemoveAvatar,
  avatarBusy,
  followRequests,
  onApproveFollowRequest,
  onDeclineFollowRequest,
}: {
  draft: ProfileDraft;
  saving?: boolean;
  /** 008/FR-017, FR-019. Null renders the derived initial, as it always has. */
  avatarUrl?: string | null;
  onChangeAvatar?: () => void;
  onRemoveAvatar?: () => void;
  avatarBusy?: boolean;
  /** FR-011. Absent while it loads, and absent in tests that do not need it. */
  feedSignals?: FeedSignalSummary | null;
  clearingSignals?: boolean;
  onChange: (next: ProfileDraft) => void;
  onSave: () => void;
  onClearFeedSignals?: () => void;
  onDeleteAccount: () => void;
  /**
   * 008/FR-043 — THE OTHER HALF OF THE TOGGLE.
   *
   * A private account whose requests cannot be answered is a switch that traps
   * everybody outside it forever. The list is on THIS screen, beside the control
   * that creates it, rather than on a screen of its own that nothing links to —
   * 008's whole subject is a declared half with no other half, and a settings
   * toggle with an unreachable queue is exactly that shape.
   */
  followRequests?: { userId: string; handle: string; displayName: string }[];
  onApproveFollowRequest?: (handle: string) => void;
  onDeclineFollowRequest?: (handle: string) => void;
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

      {/*
        008/FR-017 — SET OR REMOVE A PROFILE PICTURE.
        
        `avatarKey` has existed on the person item, `media.limits.ts` has had an
        `avatar` entry, and `POST /v1/media/uploads` has accepted kind `avatar`
        since 001. Nothing could set one: the upload half was built and the
        setting half never was. This is that half.
        
        FR-019: with no avatar, `Avatar` renders the derived initial exactly as
        before — the control changes what a person CAN do, not what they see when
        they have not done it.
      */}
      {onChangeAvatar ? (
        <View
          testID="avatar-editor"
          style={{ alignItems: 'center', gap: space.sm, paddingTop: space.lg }}
        >
          {/* The shared Avatar, so the preview cannot drift from every other
              surface - and its own testID `avatar-<userId>` is unchanged
              whether it holds a photograph or the derived initial. */}
          <Avatar
            userId={draft.userId}
            displayName={draft.displayName}
            {...(avatarUrl ? { url: avatarUrl } : {})}
            size={72}
          />
          <Row style={{ gap: space.sm }}>
            <Button
              testID="change-avatar"
              label={avatarBusy ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Add photo'}
              variant="secondary"
              disabled={avatarBusy === true}
              onPress={onChangeAvatar}
            />
            {avatarUrl && onRemoveAvatar ? (
              <Button
                testID="remove-avatar"
                label="Remove"
                variant="secondary"
                disabled={avatarBusy === true}
                onPress={onRemoveAvatar}
              />
            ) : null}
          </Row>
        </View>
      ) : null}

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

      {/*
        008/FR-043. WHO CAN SEE WHAT YOU POST.
        
        Worded as the consequence, not as the setting: "private" alone does not
        say whether it applies to what is already published, and FR-044 says it
        does. FR-045 — the people already following you keep their access — is
        the second sentence, because it is the question anybody about to flip
        this switch is actually asking.
      */}
      <View testID="account-privacy" style={{ gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.lg }}>
        <Text style={{ ...textStyle.caption, color: palette.text.muted }}>Who can see what you post</Text>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ ...textStyle.body, color: palette.text.primary }}>Private account</Text>
          <Switch
            testID="account-privacy-switch"
            accessibilityLabel="Private account"
            value={draft.accountPrivacy === 'private'}
            onValueChange={(value) =>
              onChange({ ...draft, accountPrivacy: value ? 'private' : 'open' })
            }
          />
        </Row>
        <Text testID="account-privacy-explainer" style={{ ...textStyle.caption, color: palette.text.muted }}>
          {draft.accountPrivacy === 'private'
            ? 'Only people you approve can see your posts. Everyone already following you keeps access.'
            : 'Anyone can see your posts.'}
        </Text>
      </View>

      {/*
        The queue the switch creates. Rendered whenever there is something in it,
        whatever the switch currently says — turning privacy back off does not
        answer the requests that arrived while it was on.
      */}
      {followRequests && followRequests.length > 0 ? (
        <View testID="follow-requests" style={{ gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.lg }}>
          <Text style={{ ...textStyle.caption, color: palette.text.muted }}>
            {followRequests.length === 1 ? '1 person wants to follow you' : `${followRequests.length} people want to follow you`}
          </Text>
          {followRequests.map((p) => (
            <Row key={p.userId} style={{ justifyContent: 'space-between', gap: space.sm }}>
              <Text
                testID={`follow-request-${p.handle}`}
                style={{ ...textStyle.body, color: palette.text.primary, flexShrink: 1 }}
              >
                {`${p.displayName} @${p.handle}`}
              </Text>
              <Row style={{ gap: space.sm }}>
                <Button
                  testID={`approve-follow-request-${p.handle}`}
                  label="Approve"
                  onPress={() => onApproveFollowRequest?.(p.handle)}
                />
                <Button
                  testID={`decline-follow-request-${p.handle}`}
                  label="Decline"
                  variant="secondary"
                  onPress={() => onDeclineFollowRequest?.(p.handle)}
                />
              </Row>
            </Row>
          ))}
        </View>
      ) : null}

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
