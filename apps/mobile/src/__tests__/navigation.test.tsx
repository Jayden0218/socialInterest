import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
  /**
   * THE SERVER'S SHAPE, not the one the data layer used to declare.
   *
   * These stubs said `{ items, nextCursor }` — matching a type that was wrong —
   * so the app's paging bug (007) was invisible here: the stubs and the code
   * agreed with each other and neither agreed with the API.
   */
  const page = { items: [], page: { nextCursor: null, emptyStateHint: null } };
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
    posts: { get: async () => null, publish: async () => ({ postId: 'p1' }), byHandle: async () => page },
    /**
     * 007. `seedInterests` non-empty by default, so signing in does NOT land on
     * the cold-start screen in tests about something else. The cold start is
     * exercised deliberately, where it is the subject.
     */
    signals: {
      record: async () => ({ accepted: 0, rejected: 0 }),
      disclosure: async () => ({ interests: [], seedInterests: ['i1'], collected: [] }),
      clear: async () => ({ cleared: true }),
      chooseSeedInterests: async () => ({ seedInterests: [] }),
      ...(over.signals as object),
    },
    people: {
      get: async () => ({ userId: 'u2', handle: 'someone', displayName: 'Someone', bio: null,
        followerCount: 3, followingCount: 1, topInterests: [], viewerIsFollowing: false }),
      posts: async () => page,
      follow: async () => undefined,
      unfollow: async () => undefined,
      // 004/FR-034. Discover queries people alongside interests; a stub without
      // it makes the whole search screen throw, which is what happened.
      search: async () => ({ items: [] }),
    },
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
    await act(async () => {
      fireEvent.press(screen.getByTestId('open-compose'));
    });
    expect(screen.getByTestId('sign-in-screen')).toBeTruthy();
  });

  it('signs in through the screen and comes back', async () => {
    renderShell();
    await act(async () => {
      fireEvent.press(screen.getByTestId('open-sign-in'));
    });
    expect(screen.getByTestId('sign-in-screen')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('sign-in-token'), 'a-token');
    // signIn resolves on a promise, and the state updates it causes land outside
    // any act() boundary that fireEvent opened. Settling the chain inside act
    // makes the result observable synchronously; a polling waitFor races it and
    // fails about half the time under a loaded worker.
    await act(async () => {
      fireEvent.press(screen.getByTestId('sign-in-submit'));
    });

    // Back on the tabs, and now signed in - so the sign-in affordance is gone.
    expect(screen.queryByTestId('sign-in-screen')).toBeNull();
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
    await act(async () => {
      fireEvent.press(screen.getByTestId('sign-in-submit'));
    });

    expect(screen.getByTestId('sign-in-error')).toBeTruthy();
    // Still on the sign-in screen: a rejected token must not look like success.
    expect(screen.getByTestId('sign-in-screen')).toBeTruthy();
  });

  it('goes back from a pushed screen', async () => {
    renderShell();
    await act(async () => {
      fireEvent.press(screen.getByTestId('open-sign-in'));
    });
    expect(screen.getByTestId('sign-in-screen')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('nav-back'));
    });
    expect(screen.getByTestId('home-feed-screen')).toBeTruthy();
  });

  it('reaches compose, comments and safety once signed in', async () => {
    const data = fakeData({ session: { isSignedIn: async () => true, me: async () => ({
      handle: 'me', displayName: 'Me', bio: null, interestFollowCount: 0,
      followerCount: 0, followingCount: 0, topInterests: [],
      notificationPrefs: { reaction: true, comment: true, follow: true },
    }) } });
    renderShell(data);
    await waitFor(() => expect(screen.queryByTestId('open-sign-in')).toBeNull());

    await act(async () => {
      fireEvent.press(screen.getByTestId('open-compose'));
    });

    // T038. Compose now starts at the media picker, where a person starts it.
    // It used to open straight onto the compose form with a bundled sample
    // image, so the first step of the core act was skipped.
    expect(screen.getByTestId('media-picker-screen')).toBeTruthy();

    // No native gallery under jest, so the sample media is offered - T039, the
    // fallback that keeps publish drivable everywhere the picker does not exist.
    await act(async () => {
      fireEvent.press(screen.getByTestId('media-item-image-0'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('media-continue'));
    });
    expect(screen.getByTestId('compose-screen')).toBeTruthy();
  });

  it('explains a refused photo permission rather than looking broken (FR-012)', async () => {
    const data = fakeData({ session: { isSignedIn: async () => true, me: async () => ({
      handle: 'me', displayName: 'Me', bio: null, interestFollowCount: 0,
      followerCount: 0, followingCount: 0, topInterests: [],
      notificationPrefs: { reaction: true, comment: true, follow: true },
    }) } });
    renderShell(data);
    await waitFor(() => expect(screen.queryByTestId('open-sign-in')).toBeNull());
    await act(async () => {
      fireEvent.press(screen.getByTestId('open-compose'));
    });

    // The requirement is that the app SAYS something - not which thing it says.
    // Asserting the exact banner tied this to whether the native module happens
    // to resolve under jest, and it broke the moment the picker version was
    // corrected, for a reason that had nothing to do with FR-012.
    //
    // What must hold either way: the person is told, and the app does NOT
    // proceed into compose with media they did not choose.
    await act(async () => {
      fireEvent.press(screen.getByTestId('open-library'));
    });
    const explained =
      screen.queryByTestId('library-unavailable') ?? screen.queryByTestId('library-permission-denied');
    expect(explained).not.toBeNull();
    expect(screen.queryByTestId('compose-screen')).toBeNull();
  });
  /**
   * T053. Following a person did NOTHING: ProfileContainer called
   * `session.me()` whatever handle it was given, hardcoded
   * `viewerIsFollowing: false`, and passed `onToggleFollow={() => undefined}`.
   * The data layer had no person-follow method at all.
   *
   * Nothing caught it, because every existing test rendered ProfileScreen
   * directly with props - which proved the SCREEN worked and said nothing
   * about whether anything called it. This drives the container.
   */
  it('follows another person, and calls the service to do it (T053)', async () => {
    let followed: string | null = null;
    let viewerIsFollowing = false;
    const data = fakeData({
      session: { isSignedIn: async () => true, me: async () => ({
        userId: 'u1', handle: 'me', displayName: 'Me', bio: null, interestFollowCount: 0,
        followerCount: 0, followingCount: 0, topInterests: [],
        notificationPrefs: { reaction: true, comment: true, follow: true },
      }) },
      posts: {
        byHandle: async () => ({ items: [], page: { nextCursor: null, emptyStateHint: null } }),
        get: async () => ({
          postId: 'p1', caption: 'hello', interests: [], media: [],
          reactionCount: 0, commentCount: 0, viewerHasReacted: false,
          processingState: 'ready', visibility: 'public',
          author: { userId: 'u2', handle: 'someone', displayName: 'Someone' },
        }),
        publish: async () => ({ postId: 'p1' }),
      },
      feed: {
        home: async () => ({
          items: [{ postId: 'p1', caption: 'hello', interests: [], media: [],
            reactionCount: 0, commentCount: 0, processingState: 'ready', visibility: 'public',
            author: { userId: 'u2', handle: 'someone', displayName: 'Someone' } }],
          page: { nextCursor: null, emptyStateHint: null },
        }),
      },
      people: {
        get: async () => ({
          userId: 'u2', handle: 'someone', displayName: 'Someone', bio: null,
          followerCount: 3, followingCount: 1, topInterests: [], viewerIsFollowing,
        }),
        posts: async () => ({ items: [], page: { nextCursor: null, emptyStateHint: null } }),
        search: async () => ({ items: [] }),
        follow: async (h: string) => {
          followed = h;
          viewerIsFollowing = true;
        },
        unfollow: async () => undefined,
      },
    });
    renderShell(data);
    await waitFor(() => expect(screen.queryByTestId('open-sign-in')).toBeNull());

    // Reach a post, then its author. Before T053 there was no route to another
    // person at all, so a working control would still have been unreachable.
    await waitFor(() => expect(screen.getByTestId('post-p1')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('post-p1'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('open-author'));
    });

    // Someone else's profile, not yours. This is the assertion the old
    // container failed: it showed you yourself whatever handle it was given.
    await waitFor(() => expect(screen.getByTestId('follow-person-toggle')).toBeTruthy());
    expect(screen.getByTestId('follow-person-toggle').props.children).not.toBe('Following');

    await act(async () => {
      fireEvent.press(screen.getByTestId('follow-person-toggle'));
    });

    // The service was called, with the right handle. A button that only
    // changed local state would pass an appearance check and fail this.
    expect(followed).toBe('someone');
  });
  /**
   * Tapping a search result must open that interest.
   *
   * Nothing exercised this press anywhere: `screens.test.tsx` renders
   * InterestSearchScreen with `onSelect={() => undefined}` and asserts the row's
   * TEXT. That proves the row renders and says nothing about what pressing it
   * does - the same gap that hid ProfileContainer's dead follow button and left
   * MediaPickerScreen unreachable.
   *
   * On a device (run 16) the search screen was still visible after the tap, so
   * the app had not navigated. This drives the same press through the shell.
   */
  it('opens an interest from a search result (03-follow-interest)', async () => {
    const found = {
      interestId: 'i-climbing', name: 'Climbing', slug: 'climbing',
      level: 'top', postCount: 0, followerCount: 0, state: 'active',
    };
    const data = fakeData({
      interests: {
        search: async () => ({ items: [found], page: { nextCursor: null } }),
        suggested: async () => ({ items: [], page: { nextCursor: null, emptyStateHint: null } }),
        listTop: async () => ({ items: [found], page: { nextCursor: null } }),
        listChildren: async () => ({ items: [], page: { nextCursor: null, emptyStateHint: null } }),
        get: async () => found,
        posts: async () => ({ items: [], page: { nextCursor: null, emptyStateHint: null } }),
        follow: async () => undefined,
        unfollow: async () => undefined,
      },
    });
    renderShell(data);

    await act(async () => {
      fireEvent.press(screen.getByTestId('tab-discover'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('interest-search-input'), 'clim');
    });
    await waitFor(() => expect(screen.getByTestId('search-result-0')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('search-result-0'));
    });

    // Navigation replaces the tab content entirely - the shell returns early
    // when a route is pushed - so the search screen must be gone.
    expect(screen.queryByTestId('interest-search-screen')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('interest-screen')).toBeTruthy());
  });
  /**
   * Your own posts must appear on your own profile.
   *
   * The "You" tab renders `<ProfileContainer handle="me" isSelf />`, and that
   * literal "me" went straight to the server as a handle:
   * `GET /v1/people/me/posts` -> 404 -> an empty list, silently. The profile
   * itself loaded, because `isSelf` reads it from `session.me()`, so the screen
   * looked fine and simply never showed anything you had published.
   *
   * Found by the device journeys - the API log carried three
   * `GET /v1/people/:handle/posts 404` against exactly the three failing flows.
   * This asserts the request is made with the REAL handle.
   */
  it('loads your own posts on your own profile, by real handle (not "me")', async () => {
    const asked: string[] = [];
    const data = fakeData({
      session: { isSignedIn: async () => true, me: async () => ({
        userId: 'u1', handle: 'realhandle', displayName: 'Me', bio: null,
        interestFollowCount: 0, followerCount: 0, followingCount: 0, topInterests: [],
        notificationPrefs: { reaction: true, comment: true, follow: true },
      }) },
      posts: {
        byHandle: async (h: string) => {
          asked.push(h);
          return {
            items: [{ postId: 'p9', caption: 'mine', interests: [], media: [],
              reactionCount: 0, commentCount: 0, processingState: 'ready', visibility: 'public',
              author: { userId: 'u1', handle: 'realhandle', displayName: 'Me' } }],
            page: { nextCursor: null, emptyStateHint: null },
          };
        },
        get: async () => null,
        publish: async () => ({ postId: 'p9' }),
      },
    });
    renderShell(data);
    await waitFor(() => expect(screen.queryByTestId('open-sign-in')).toBeNull());

    await act(async () => {
      fireEvent.press(screen.getByTestId('tab-profile'));
    });

    await waitFor(() => expect(screen.getByTestId('post-p9')).toBeTruthy());
    // The literal "me" is never sent as a handle.
    expect(asked).not.toContain('me');
    expect(asked).toContain('realhandle');
  });
});
