import { act, fireEvent, render } from '@testing-library/react-native';
import { DataProvider } from '../data-provider';
import { EditProfileContainer } from '../screens';
import type { AppData } from '../data';

/**
 * 008/US5, AFTER EMULATOR RUN 50 — SETTING A PICTURE MUST NOT NEED A SYSTEM UI.
 *
 * `27-set-avatar` failed on the device, and the reason was not the upload path:
 * `onChangeAvatar` awaited `library.pick()`, which on a real device opens the
 * system gallery — a modal owned by `com.android.documentsui` that neither the
 * app nor a Maestro flow can dismiss. The run's aggregate shows 12 uploads for
 * 10 posts, exactly the media those posts needed, so no avatar upload was ever
 * attempted: the app was not slow, it was behind a window nobody could close.
 *
 * A SCREEN TEST COULD NOT HAVE CAUGHT THIS, and neither could the browser
 * journeys: react-native-web has no native picker, so `pick()` there falls
 * straight through to the bundled sample set and everything works. What is
 * testable, here, is the CONTAINER's route — that the control opens the app's
 * own picker and that choosing an image reaches the data layer.
 */
const me = {
  userId: 'u1',
  handle: 'ada',
  displayName: 'Ada Baird',
  bio: null,
  avatarUrl: null,
  followerCount: 0,
  followingCount: 0,
  postCount: 0,
  interestFollowCount: 0,
  viewerIsFollowing: false,
  status: 'active' as const,
  notificationPrefs: { reaction: true, comment: true, follow: true, message: true },
};

function fakeData(calls: string[]): AppData {
  return {
    session: {
      me: async () => me,
      updateProfile: async (patch: Record<string, unknown>) => {
        calls.push(`updateProfile:${JSON.stringify(patch)}`);
        return { ...me, avatarUrl: 'https://example.test/a.jpg' };
      },
      deleteAccount: async () => undefined,
    },
    signals: {
      disclosure: async () => ({ interests: [], collected: [] }),
      clear: async () => undefined,
    },
    /**
     * 008/FR-043. The container reads the follow-request queue on mount, and a
     * stub that lacks it is the stale-stub failure this repository has now seen
     * three times — `surface-routing`, `following-feed`, and here.
     */
    people: {
      followRequests: async () => ({ items: [], page: { nextCursor: null } }),
    },
    posts: {
      createUploadTarget: async (input: Record<string, unknown>) => {
        calls.push(`createUploadTarget:${String(input['kind'])}`);
        return { uploadId: 'UP1', url: 'https://example.test/put', headers: {} };
      },
      uploadBytes: async () => {
        calls.push('uploadBytes');
      },
    },
  } as unknown as AppData;
}

const renderEditor = (data: AppData) =>
  render(
    <DataProvider value={data}>
      <EditProfileContainer onDone={() => undefined} />
    </DataProvider>,
  );

describe('008/US5 the avatar editor, through the container', () => {
  it('opens the APP\'S OWN picker rather than handing off to the device gallery', async () => {
    const calls: string[] = [];
    const t = renderEditor(fakeData(calls));
    await act(async () => undefined);

    fireEvent.press(t.getByTestId('change-avatar'));

    // The screen a device flow can actually drive. Before this fix the tap
    // awaited a native modal and this assertion is the difference.
    t.getByTestId('media-picker-screen');
    expect(t.getByTestId('media-item-image-0')).toBeTruthy();
  });

  it('uploads the chosen image as an AVATAR and sets it by upload id', async () => {
    const calls: string[] = [];
    const t = renderEditor(fakeData(calls));
    await act(async () => undefined);

    fireEvent.press(t.getByTestId('change-avatar'));
    fireEvent.press(t.getByTestId('media-item-image-0'));
    await act(async () => {
      fireEvent.press(t.getByTestId('media-continue'));
    });

    /**
     * `kind: 'avatar'` and the UPLOAD ID, not a key. 002's second defect was a
     * client-supplied key letting a post point at another person's media, so
     * the server reads the key from the record it issued.
     */
    expect(calls).toEqual([
      'createUploadTarget:avatar',
      'uploadBytes',
      'updateProfile:{"avatarUploadId":"UP1"}',
    ]);
  });

  it('offers Remove once there is a picture, and removes by sending null', async () => {
    const calls: string[] = [];
    const t = renderEditor(fakeData(calls));
    await act(async () => undefined);

    fireEvent.press(t.getByTestId('change-avatar'));
    fireEvent.press(t.getByTestId('media-item-image-0'));
    await act(async () => {
      fireEvent.press(t.getByTestId('media-continue'));
    });

    await act(async () => {
      fireEvent.press(t.getByTestId('remove-avatar'));
    });
    // FR-017: `null` REMOVES it, where an absent field would leave it alone.
    expect(calls.at(-1)).toBe('updateProfile:{"avatarUploadId":null}');
  });
});
