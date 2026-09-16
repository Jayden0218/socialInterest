/**
 * A COMPLETE `AppData`, STUBBED — SHARED, because a second copy is the drift.
 *
 * `App` touches most of the data layer on mount: the feed, the signals
 * disclosure that decides whether the cold start appears, the collections list
 * post detail reads, people search. A partial fake does not fail with "missing
 * method"; it fails with `Can't access .root on unmounted test renderer`,
 * because the component threw during render. That cost a debugging pass when
 * `session-survives-relaunch.test.tsx` was written against a fake holding only
 * `session`.
 *
 * Extracted from `navigation.test.tsx` rather than copied into the second file.
 * 004 recorded the cost of the other choice: `EditProfileScreen` kept a private
 * three-entry category list while `NOTIFICATION_CATEGORIES` had four, and "the
 * duplicate is not a risk of drift, it IS the drift".
 *
 * THE STUBS MATCH THE SERVER'S SHAPE, not a type the app once declared. These
 * used to say `{ items, nextCursor }` — agreeing with a type that was wrong —
 * which is why 007's paging defect was invisible to 165 green tests: the stubs
 * and the code agreed with each other and neither agreed with the API.
 */
import type { AppData } from '../../data';

export function fakeData(over: Partial<Record<string, unknown>> = {}): AppData {
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
  const base = {
    client: { call: async () => ({}) },
    session: {
      isSignedIn: async () => false,
      /**
       * 011/FR-013. `Shell` asks this at launch, not `isSignedIn`.
       *
       * Its absence was the first thing to break when `resume` landed, and the
       * failure was `data.session.resume is not a function` in six suites that
       * had nothing to do with identity — a stub agreeing with an older shape,
       * which is the `ApiPage<T>` failure this file's own header warns about.
       *
       * `null` by default: no stored credential, an ordinary signed-out launch.
       * A suite that cares overrides it.
       */
      resume: async () => null,
      // 011 split the one `signIn` into the product path and the developer one.
      // Both are stubbed: a stub that agrees with an older shape is the
      // `ApiPage<T>` failure in miniature — it agrees with the test and not with
      // the server, and 007 shipped five features of green tests that way.
      signInWithPassword: async () => me,
      signUp: async () => me,
      signInWithToken: async () => me,
      me: async () => me,
      signOut: async () => undefined,
      updateProfile: async () => me,
    },
    interests: {
      search: async () => page,
      suggested: async () => page,
      listTop: async () => page,
      get: async () => ({
        interestId: 'i1',
        name: 'Bouldering',
        slug: 'bouldering',
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
    /**
     * 008/US15. Post detail reads the collection list on mount so it can offer
     * somewhere to file the post — a shelf you can create and never fill would
     * be this feature's own version of the defect 008 exists to end.
     *
     * A stub without it is the STALE-STUB failure this repository has now seen
     * four times: `surface-routing`, `following-feed`, `avatar-container`, here.
     * It is always the same shape — a stub agreeing with an older version of the
     * thing it stands in for — and it is always the test that finds it, which is
     * the argument for the stubs being complete rather than minimal.
     */
    saved: {
      list: async () => page,
      save: async () => undefined,
      unsave: async () => undefined,
      collections: async () => ({ items: [], page: { nextCursor: null } }),
      collectionPosts: async () => page,
      createCollection: async () => ({ collectionId: 'c1', name: 'x', itemCount: 0, createdAt: 'z' }),
      addToCollection: async () => undefined,
      removeFromCollection: async () => undefined,
      deleteCollection: async () => undefined,
    },
    engagement: { comments: async () => page, comment: async () => undefined },
    safety: { report: async () => undefined, block: async () => undefined },
    notifications: { list: async () => page },
  };

  /**
   * A ONE-LEVEL MERGE, AND THE TRAILING `...over` IT REPLACES WAS A LIVE BUG.
   *
   * The previous version spread `over` at the END of this object, after each
   * slice had carefully merged its own overrides (`...(over.session as
   * object)`). The trailing spread REPLACED every one of those merged slices
   * wholesale — so a caller passing `session: { isSignedIn }` got a session
   * with `isSignedIn` and nothing else, and all the per-key merging above was
   * dead code that looked like a feature.
   *
   * It was harmless only because every caller happened to supply everything the
   * shell touched. 011 added `session.resume()`, which `Shell` calls at launch,
   * and five suites died with `data.session.resume is not a function` — a
   * default that was right, in a fixture that discarded it.
   *
   * Merging per key here means an override ADDS to a slice rather than
   * replacing it, which is what every call site in this repository already
   * assumed it did.
   */
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const existing = (base as Record<string, unknown>)[key];
    merged[key] =
      existing && typeof existing === 'object' && value && typeof value === 'object'
        ? { ...(existing as object), ...(value as object) }
        : value;
  }
  return merged as unknown as AppData;
}
