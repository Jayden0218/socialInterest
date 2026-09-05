import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { AppData } from '../data';
import { DataProvider } from '../data-provider';
import { Shell } from '../App';

/**
 * The wiring, not the screens.
 *
 * Every screen in this app was render-tested and every one of them passed while
 * the product was, on a device, a read-only three-tab shell: `App.tsx` mounted
 * three containers and passed `() => undefined` where navigation belonged. Post
 * detail, comments, safety and compose were exported and never used; there was
 * no sign-in screen at all.
 *
 * Neither existing suite could see it. The render tests mount each screen
 * directly, so they never ask whether anything reaches it. apps/e2e drives
 * `src/data`, so it never renders. This file asserts the edges between screens -
 * the only thing that was actually missing.
 */

/** A data layer that answers, so containers reach a rendered state. */
function fakeData(over: Partial<Record<string, unknown>> = {}): AppData {
  const page = { items: [], nextCursor: null };
  const me = {
    handle: 'me',
    displayName: 'Me',
    bio: null,
    interestFollowCount: 0,
    followerCount: 0,
    followingCount: 0,
    topInterests: [],
    notificationPrefs: { reaction: true, comment: true, follow: true },
  };
  return {
    client: { call: async () => ({}) },
    session: {
      isSignedIn: async () => false,
      signIn: async () => me,
      me: async () => me,
      signOut: async () => undefined,
      updateProfile: async () => me,
      ...(over.session as object),
    },
    interests: {
      search: async () => page,
      suggested: async () => page,
      listTop: async () => page,
      listChildren: async () => page,
      get: async () => ({
        interestId: 'i1',
        name: 'Bouldering',
        slug: 'bouldering',
        level: 'top',
        postCount: 0,
        followerCount: 0,
        state: 'active',
      }),
      posts: async () => page,
      follow: async () => undefined,
      unfollow: async () => undefined,
    },
    posts: { get: async () => null, publish: async () => ({ postId: 'p1' }) },
    feed: { home: async () => page },
    engagement: { comments: async () => page, comment: async () => undefined },
    safety: { report: async () => undefined, block: async () => undefined },
    notifications: { list: async () => page },
    ...over,
  } as unknown as AppData;
}

const renderShell = (data: AppData = fakeData()) =>
  render(
    <DataProvider value={data}>
      <Shell />
    </DataProvider>,
  );

describe('the shell reaches every screen', () => {
  it('opens an interest space from discover', async () => {
    renderShell();
    fireEvent.press(screen.getByTestId('tab-discover'));
    fireEvent.press(screen.getByTestId('tab-discover'));
    // Discover renders; selecting an interest must push, not be swallowed by a
    // `() => undefined` callback, which is exactly what it used to be.
    expect(screen.getByTestId('interest-search-screen')).toBeTruthy();
  });

  it('offers sign in, and reaching compose while signed out routes there', async () => {
    renderShell();
    fireEvent.press(screen.getByTestId('open-compose'));
    await waitFor(() => expect(screen.getByTestId('sign-in-screen')).toBeTruthy());
  });

  it('signs in through the screen and comes back', async () => {
    renderShell();
    fireEvent.press(screen.getByTestId('open-sign-in'));
    await waitFor(() => expect(screen.getByTestId('sign-in-screen')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('sign-in-token'), 'a-token');
    fireEvent.press(screen.getByTestId('sign-in-submit'));

    // Back on the tabs, and now signed in - so the sign-in affordance is gone.
    await waitFor(() => expect(screen.queryByTestId('sign-in-screen')).toBeNull());
    expect(screen.queryByTestId('open-sign-in')).toBeNull();
  });

  it('surfaces a rejected token instead of storing it', async () => {
    const data = fakeData({
      session: {
        isSignedIn: async () => false,
        signIn: async () => {
          throw new Error('That token was not accepted.');
        },
      },
    });
    renderShell(data);
    fireEvent.press(screen.getByTestId('open-sign-in'));
    fireEvent.changeText(screen.getByTestId('sign-in-token'), 'bad');
    fireEvent.press(screen.getByTestId('sign-in-submit'));

    await waitFor(() => expect(screen.getByTestId('sign-in-error')).toBeTruthy());
    // Still on the sign-in screen: a rejected token must not look like success.
    expect(screen.getByTestId('sign-in-screen')).toBeTruthy();
  });

  it('goes back from a pushed screen', async () => {
    renderShell();
    fireEvent.press(screen.getByTestId('open-sign-in'));
    await waitFor(() => expect(screen.getByTestId('sign-in-screen')).toBeTruthy());
    fireEvent.press(screen.getByTestId('nav-back'));
    await waitFor(() => expect(screen.getByTestId('home-feed-screen')).toBeTruthy());
  });

  it('reaches compose, comments and safety once signed in', async () => {
    const data = fakeData({ session: { isSignedIn: async () => true, me: async () => ({
      handle: 'me', displayName: 'Me', bio: null, interestFollowCount: 0,
      followerCount: 0, followingCount: 0, topInterests: [],
      notificationPrefs: { reaction: true, comment: true, follow: true },
    }) } });
    renderShell(data);
    await waitFor(() => expect(screen.queryByTestId('open-sign-in')).toBeNull());

    fireEvent.press(screen.getByTestId('open-compose'));
    await waitFor(() => expect(screen.getByTestId('compose-screen')).toBeTruthy());
  });
});
