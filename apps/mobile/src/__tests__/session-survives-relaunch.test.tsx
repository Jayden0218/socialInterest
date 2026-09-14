/**
 * 011/US3. THE SESSION BEHAVES LIKE A SESSION.
 *
 * Three facts, and the middle one did not exist before 011:
 *
 *   FR-011  a credential survives the app closing and reopening
 *   FR-012  signing out is a deliberate act, and removes it
 *   FR-013  a REJECTED credential returns you to sign-in WITH AN EXPLANATION,
 *           rather than rendering an empty product
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY FR-013 NEEDED CODE AND NOT JUST A TEST
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `App` used to ask `session.isSignedIn()`, which answers "is there a token in
 * the store". That is not the same question as "may this person act". A
 * credential that has expired, been revoked by a password reset (FR-021), or
 * was issued by a backend the app no longer points at passes that check
 * perfectly — and then every screen 401s and the person is looking at an empty
 * feed with nothing to tell them why.
 *
 * "The feed is empty" and "you are signed out" look identical, and only one of
 * them is something a person can do anything about. This product has shipped
 * that confusion in six places already, always as a surface rendering nothing
 * instead of saying what went wrong.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DRIVEN THROUGH THE CONTAINER, NOT THE SCREEN
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 003 recorded exactly why: `ProfileContainer` hardcoded `viewerIsFollowing:
 * false` and wired its follow button to `() => undefined`, and every test
 * rendered `ProfileScreen` DIRECTLY WITH PROPS — which proves the screen works
 * and says nothing about whether anything calls it. **A screen test is not a
 * container test.** So these drive `App`, which is the thing that decides.
 */
import { act, render, screen } from '@testing-library/react-native';
// `Shell`, not the default export: `App` builds its OWN data layer from the
// compiled-in address, so rendering it would reach a real network. `Shell` is
// the component that reads `useData()` — which is the thing under test here.
import { Shell } from '../App';
import { DataProvider } from '../data-provider';
import { fakeData } from './fixtures/app-data';

/**
 * A token store that behaves like the device's: what `set` wrote is what `get`
 * returns, across as many "launches" as the test performs.
 */
const me = { userId: 'u1', handle: 'jo', displayName: 'Jo' };

function fakeSession(initialToken: string | null, meBehaviour: () => Promise<unknown>) {
  let token = initialToken;
  return {
    token: () => token,
    session: {
      isSignedIn: async () => token !== null,
      async resume() {
        if (token === null) return null;
        try {
          return await meBehaviour();
        } catch (err) {
          const status = (err as { status?: number }).status;
          if (status === 401 || status === 403 || status === 404) {
            token = null;
            return 'rejected' as const;
          }
          throw err;
        }
      },
      me: async () => me,
      signOut: async () => {
        token = null;
      },
    },
  };
}

/**
 * The SHARED fake, with only the session replaced.
 *
 * `App` touches most of the data layer on mount, and a fake holding only
 * `session` does not fail with "missing method" — it fails with "Can't access
 * .root on unmounted test renderer", because the component threw during render.
 * That is what the first version of this file did.
 */
/**
 * Rendered OUTSIDE `act`, then the effects are flushed inside one.
 *
 * Calling `render` from within an `act` callback leaves RNTL's `screen` bound to
 * a renderer it considers unmounted, and every later query fails with "Can't
 * access .root on unmounted test renderer" — pointing at the render call rather
 * than at the query, which is why this took a second look.
 *
 * The flush matters on its own: `Shell` resolves the session in an effect, so a
 * synchronous assertion after `render` reads the state before the answer
 * arrives and every one of these tests would be measuring the initial value.
 */
async function launch(session: unknown): Promise<void> {
  render(
    <DataProvider value={fakeData({ session: session as Record<string, unknown> })}>
      <Shell />
    </DataProvider>,
  );
  await act(async () => undefined);
}

describe('the session across a relaunch', () => {
  it('FR-011: a stored credential that still works opens signed in', async () => {
    const fake = fakeSession('a-credential', async () => me);
    await launch(fake.session);

    // The sign-in affordance is what "signed out" looks like in this shell.
    expect(screen.queryByTestId('open-sign-in')).toBeNull();
  });

  it('opens signed OUT when nothing was stored', async () => {
    const fake = fakeSession(null, async () => me);
    await launch(fake.session);
    expect(screen.getByTestId('open-sign-in')).toBeTruthy();
  });

  it('FR-013: a REJECTED credential opens signed out, and discards it', async () => {
    /**
     * The assertion that matters is not "it showed sign-in" — it is that the
     * credential was CLEARED. Left in the store, the next launch repeats this
     * one: a person stuck in a loop of being signed out by something they
     * cannot see.
     */
    const rejected = Object.assign(new Error('Unauthorised'), { status: 401 });
    const fake = fakeSession('a-stale-credential', async () => {
      throw rejected;
    });

    await launch(fake.session);

    expect(screen.getByTestId('open-sign-in')).toBeTruthy();
    expect(fake.token()).toBeNull();
  });

  it('FR-013: a NETWORK failure is not a rejection, and keeps the credential', async () => {
    /**
     * THE CASE THAT IS EASY TO GET WRONG IN THE OTHER DIRECTION.
     *
     * Treating an unreachable backend as "your credential is bad" signs
     * somebody out of a working account because their train went into a tunnel
     * — and throws the credential away to do it, so it is not recoverable when
     * the network comes back. `DataError` uses status 0 for "no HTTP response
     * happened at all", which is the same signal `describeFailure` reads.
     */
    const offline = Object.assign(new Error('Network request failed'), { status: 0 });
    const fake = fakeSession('a-good-credential', async () => {
      throw offline;
    });

    await launch(fake.session);

    expect(fake.token()).toBe('a-good-credential');
  });

  it('FR-012: signing out clears the credential, so the next launch asks', async () => {
    const fake = fakeSession('a-credential', async () => me);
    await launch(fake.session);
    expect(screen.queryByTestId('open-sign-in')).toBeNull();

    await act(async () => {
      await fake.session.signOut();
    });

    // THE RELAUNCH IS THE ASSERTION, not the call. FR-012 is about what the
    // next launch does, and asserting that `signOut` was called would prove the
    // button is wired and nothing about the requirement.
    screen.unmount();
    await launch(fake.session);
    expect(screen.getByTestId('open-sign-in')).toBeTruthy();
  });
});
