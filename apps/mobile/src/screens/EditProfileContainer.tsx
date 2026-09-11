/**
 * EditProfileContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import type { PublicProfile } from '@sih/shared';
import {
  type FeedSignalSummary,
  EditProfileScreen,
  type ProfileDraft,
} from '../features/profile/EditProfileScreen';
import { useData } from '../data-provider';
import { DataError } from '../data';
import { MediaPickerScreen, type PickedMedia } from '../features/publish/MediaPickerScreen';
import { useMediaLibrary } from '../features/publish/useMediaLibrary';
import { readMediaBytes } from '../features/publish/uploadFlow';
import { Failed } from './shared';

/**
 * Edit your profile and notification preferences (FR-002, FR-049), and delete
 * your account (FR-048).
 *
 * Also never mounted. The preferences half could not have worked even if it had
 * been: the data layer's updateProfile did not accept notificationPrefs until
 * this change, so a toggle had nowhere to go.
 */
export function EditProfileContainer({
  onDone,
  onOpenModerationNotices,
}: {
  onDone: () => void;
  onOpenModerationNotices?: () => void;
}) {
  const data = useData();
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 007/FR-011, FR-012.
  const [feedSignals, setFeedSignals] = useState<FeedSignalSummary | null>(null);
  const [clearingSignals, setClearingSignals] = useState(false);
  // 008/FR-017. Declared BEFORE any return, like every hook in this file -
  // `hooks-before-return.test.ts` fails the build otherwise.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const library = useMediaLibrary();
  /**
   * 008/T086, after emulator run 50 — THE PICKER IS THE APP'S OWN.
   *
   * This used to call `library.pick()` directly, which on a device opens the
   * SYSTEM gallery: a modal owned by `com.android.documentsui` that nothing in
   * the app or the flow can dismiss. Run 50's `27-set-avatar` waited 120 seconds
   * for a photo to appear and the whole-run aggregate shows 12 uploads for 10
   * posts — exactly the media those posts needed and not one byte more, so no
   * avatar upload was ever attempted.
   *
   * Compose has never had that problem, because it does not hand off blind: it
   * shows `MediaPickerScreen` — the app's own list, with the device library
   * behind an explicit control (`10-publish-from-library` verifies that
   * hand-off and deliberately does not drive Google's UI). Setting a picture now
   * takes the same route, which is both the consistent product and the one a
   * device run can drive.
   */
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [avatarChoice, setAvatarChoice] = useState<PickedMedia[]>([]);
  // 008/FR-043. The queue the privacy toggle creates, on the screen that
  // creates it — see the note on `EditProfileScreen`'s `followRequests` prop.
  const [followRequests, setFollowRequests] = useState<PublicProfile[]>([]);

  useEffect(() => {
    let live = true;
    /**
     * Read alongside the profile rather than behind a tap. FR-011 says a person
     * must be able to SEE what their feed is built from; a disclosure hidden
     * behind another navigation step is one SC-003 gives them thirty seconds to
     * find, from the app's main screen, without guidance.
     */
    data.signals
      .disclosure()
      .then((d) => live && setFeedSignals({ interests: d.interests, collected: d.collected }))
      // A failed disclosure hides the group; it must never block editing a name.
      .catch(() => undefined);
    data.session
      .me()
      .then((me) => {
        if (!live) return;
        setDraft({
          userId: me.userId,
          displayName: me.displayName,
          bio: me.bio ?? '',
          notificationPrefs: me.notificationPrefs,
          // Absent means `open`, exactly as it does on the stored row.
          accountPrivacy: me.accountPrivacy ?? 'open',
        });
        setAvatarUrl(me.avatarUrl ?? null);
      })
      .catch((e: unknown) => live && setError(e instanceof DataError ? e.message : String(e)))
      /**
       * 008/FR-043. LAST, and swallowing its own failures.
       *
       * Ordered after the profile deliberately: an empty or failed request list
       * must never stop somebody editing their name. The first version ran it
       * first and a container test with an incomplete data stub took the whole
       * effect down with it — which is the production failure mode too, just
       * with a different cause.
       */
      .then(() => data.people.followRequests())
      .then((page) => live && setFollowRequests(page.items))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [data]);

  /**
   * 008/FR-017, FR-018 — SET A PROFILE PICTURE.
   *
   * The SAME presign/PUT/quote path as any other image: `createUploadTarget`
   * with kind `avatar`, PUT the bytes, then send the UPLOAD ID. The server reads
   * the key from the record it issued, because 002's second defect was a
   * client-supplied key letting a post point at another person's media.
   *
   * The library is the same one compose uses. `expo install`-provisioned only —
   * `pnpm add` once took `expo-image-picker@57` against SDK 54 and killed the
   * app during module registration with `NoClassDefFoundError: AnyTypeCache`.
   */
  const uploadAvatar = useCallback(async (picked: PickedMedia) => {
    setAvatarBusy(true);
    try {
      const bytes = await readMediaBytes(picked.uri, fetch);
      /**
       * `readMediaBytes` returns `Uint8Array | Blob` - a data: URI decodes to
       * the first, a device file: URI fetches to the second - and only the Blob
       * lacks `byteLength`. `size` is its equivalent.
       *
       * The declared size is what the app TELLS the server when asking for an
       * upload target, and 006 shipped a sample declaring 68 for 70 bytes, so
       * the app announced one length and uploaded another.
       */
      const sizeBytes = bytes instanceof Uint8Array ? bytes.byteLength : bytes.size;
      const target = await data.posts.createUploadTarget({
        kind: 'avatar',
        contentType: picked.contentType,
        sizeBytes,
      });
      // Same cast and same reason as `uploadFlow.ts:128`: `fetch` accepts both,
      // and widening the data layer's signature to `any` would be worse.
      await data.posts.uploadBytes(target, bytes as unknown as Uint8Array, picked.contentType);
      const me = await data.session.updateProfile({ avatarUploadId: target.uploadId });
      setAvatarUrl(me.avatarUrl ?? null);
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    } finally {
      setAvatarBusy(false);
    }
  }, [data]);

  /** FR-017. `null` REMOVES it; absent would leave it alone. */
  const removeAvatar = useCallback(async () => {
    setAvatarBusy(true);
    try {
      const me = await data.session.updateProfile({ avatarUploadId: null });
      setAvatarUrl(me.avatarUrl ?? null);
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    } finally {
      setAvatarBusy(false);
    }
  }, [data]);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await data.session.updateProfile({
        displayName: draft.displayName,
        bio: draft.bio,
        notificationPrefs: draft.notificationPrefs,
        // 008/FR-043. Saved with everything else, so the screen has one contract.
        accountPrivacy: draft.accountPrivacy,
      });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [data, draft, onDone]);

  const deleteAccount = useCallback(async () => {
    setSaving(true);
    try {
      await data.session.deleteAccount();
      onDone();
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
      setSaving(false);
    }
  }, [data, onDone]);

  /**
   * 008/FR-043. Approve or decline, then RE-READ.
   *
   * Removing the row locally would be the obvious optimisation and would make
   * the list disagree with the server the moment a request arrives during the
   * tap. The list is small by construction — it is bounded by the people who
   * asked — so re-reading it costs one request and cannot drift.
   */
  const answerFollowRequest = useCallback(
    async (handle: string, action: 'approve' | 'decline') => {
      try {
        if (action === 'approve') await data.people.approveFollowRequest(handle);
        else await data.people.declineFollowRequest(handle);
        setFollowRequests((await data.people.followRequests()).items);
      } catch (e: unknown) {
        setError(e instanceof DataError ? e.message : String(e));
      }
    },
    [data],
  );

  const clearFeedSignals = useCallback(async () => {
    setClearingSignals(true);
    try {
      await data.signals.clear();
      /**
       * RE-READ rather than assuming an empty result. What survives a clear is
       * the person's own declarations - their seed picks and followed interests
       * - so "cleared" does not mean "empty", and a screen that assumed it did
       * would tell them the reset failed.
       */
      const after = await data.signals.disclosure();
      setFeedSignals({ interests: after.interests, collected: after.collected });
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    } finally {
      setClearingSignals(false);
    }
  }, [data]);

  if (error) return <Failed message={error} />;
  if (!draft) return <View testID="edit-profile-loading" />;
  if (pickingAvatar) {
    return (
      <MediaPickerScreen
        // Images only: a profile picture is one still. The picker's own rule
        // that a video is always a post on its own would otherwise let somebody
        // choose a clip here and be refused later by `media.limits.ts`.
        available={library.available.filter((m) => m.kind === 'image')}
        selected={avatarChoice}
        // ONE, always the most recent tap - `media-continue` is enabled by a
        // non-empty selection and an avatar is not a set.
        onChange={(next) => setAvatarChoice(next.slice(-1))}
        onContinue={() => {
          const chosen = avatarChoice[0];
          setPickingAvatar(false);
          setAvatarChoice([]);
          if (chosen) void uploadAvatar(chosen);
        }}
        libraryStatus={library.status}
        onOpenLibrary={() => void library.pick()}
      />
    );
  }
  return (
    <EditProfileScreen
      avatarUrl={avatarUrl}
      avatarBusy={avatarBusy}
      onChangeAvatar={() => setPickingAvatar(true)}
      onRemoveAvatar={() => void removeAvatar()}
      draft={draft}
      saving={saving}
      feedSignals={feedSignals}
      clearingSignals={clearingSignals}
      onChange={setDraft}
      onSave={() => void save()}
      onClearFeedSignals={() => void clearFeedSignals()}
      onDeleteAccount={() => void deleteAccount()}
      followRequests={followRequests.map((p) => ({
        userId: p.userId,
        handle: p.handle,
        displayName: p.displayName,
      }))}
      onApproveFollowRequest={(handle) => void answerFollowRequest(handle, 'approve')}
      onDeclineFollowRequest={(handle) => void answerFollowRequest(handle, 'decline')}
      onOpenModerationNotices={onOpenModerationNotices}
    />
  );
}
