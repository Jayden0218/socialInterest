import type { PublicProfile } from '@sih/shared';
import type { DataClient, TokenStore } from './client';

/**
 * What `POST /auth/sign-up` and `POST /auth/sign-in` return.
 *
 * NO PASSWORD AND NO DERIVED FORM OF ONE, in either direction — FR-016, and the
 * contract says so too. A type that could carry one is a type somebody can
 * populate.
 */
export interface Credential {
  token: string;
  userId: string;
  handle: string;
}

/**
 * GET /me returns more than PublicProfile: the counts and preferences that are
 * only yours to see. Typing it as PublicProfile would have hidden those fields
 * from every caller.
 */
/**
 * The notification categories a person can turn off (001/FR-049, extended by
 * 004/FR-031 with `message` and by 008/FR-031 with `mention`).
 *
 * Declared ONCE, here, because it was declared twice - in NotificationsScreen
 * and EditProfileScreen - and adding the fourth category to one of them and not
 * the other is exactly the drift a duplicated type invites.
 */
export interface NotificationPrefs {
  reaction: boolean;
  comment: boolean;
  follow: boolean;
  message: boolean;
  mention: boolean;
}

export interface MyProfile extends PublicProfile {
  interestFollowCount: number;
  followerCount: number;
  followingCount: number;
  notificationPrefs: NotificationPrefs;
  /**
   * 008/FR-043. How many people are waiting to be let in.
   *
   * No notification kind was added for a follow request, so this count is what
   * makes the request list reachable — a screen nothing points at is a screen
   * nobody opens.
   */
  pendingFollowRequests?: number;
}

/**
 * Sign-in, token lifetime and sign-out (002/T025).
 *
 * The token store is injected rather than imported, so this module stays free of
 * react-native and the end-to-end suite drives the same code the app runs. The app
 * supplies a persistent store; tests supply an in-memory one.
 */
export class SessionData {
  constructor(
    private readonly client: DataClient,
    private readonly tokens: TokenStore = client.tokens,
  ) {}

  /**
   * 011/FR-001. Creates an account and lands holding its credential.
   *
   * The credential is stored BEFORE `me()` is called, because `me()` is an
   * authenticated request and has nothing to send otherwise — the same order
   * `signInWithToken` uses, and for the same reason.
   */
  async signUp(input: {
    email: string;
    password: string;
    handle: string;
    displayName: string;
  }): Promise<MyProfile> {
    const credential = await this.client.call<Credential>('postAuthSignUp', { body: input });
    return this.adopt(credential);
  }

  /**
   * 011/FR-008. The ordinary way in.
   *
   * NAMED `signInWithPassword`, and the token version keeps its own name rather
   * than this one gaining an overload. They are different acts: one is a person
   * proving who they are, the other is a developer pasting a credential a script
   * minted. Collapsing them into one `signIn(emailOrToken)` is how the developer
   * path quietly becomes the product path — the distinction `issueForTesting`
   * is named to preserve, on the client side.
   */
  async signInWithPassword(email: string, password: string): Promise<MyProfile> {
    const credential = await this.client.call<Credential>('postAuthSignIn', {
      body: { email, password },
    });
    return this.adopt(credential);
  }

  private async adopt(credential: Credential): Promise<MyProfile> {
    await this.tokens.set(credential.token);
    try {
      return await this.me();
    } catch (err) {
      // Same reasoning as `signInWithToken`: never leave a credential the
      // server will reject sitting in the store, or the next call fails the
      // same way and looks like a different problem.
      await this.tokens.set(null);
      throw err;
    }
  }

  /**
   * THE DEVELOPER PATH, and it keeps working (011/FR-026).
   *
   * `pnpm mint:token` still mints a credential for a device pass, and the emulator
   * journeys and the laptop runbook both depend on it. It is no longer the
   * ordinary way in — that is `signInWithPassword` — which is why it is named
   * for what it is rather than being the plain `signIn`.
   */
  async signInWithToken(token: string): Promise<MyProfile> {
    await this.tokens.set(token);
    try {
      return await this.me();
    } catch (err) {
      // Never leave a token the server rejected sitting in the store - the next
      // call would fail the same way and look like a different problem.
      await this.tokens.set(null);
      throw err;
    }
  }

  me(): Promise<MyProfile> {
    return this.client.call<MyProfile>('getMe');
  }

  /**
   * FR-002, FR-049. notificationPrefs is part of the patch because the server
   * accepts it and merges it - the type here used to omit it, so toggling a
   * notification category was not expressible from the app at all, whatever the
   * screen offered.
   */
  updateProfile(patch: {
    displayName?: string;
    bio?: string;
    notificationPrefs?: Partial<NotificationPrefs>;
    /**
     * 008/FR-017. An UPLOAD ID, never a key - the server reads the key from the
     * record it issued (002's second defect was a client-supplied key letting a
     * post point at another person's media).
     *
     * `null` REMOVES the avatar; absent leaves it alone. Both are needed, and
     * `undefined` cannot mean both without one of them silently losing.
     */
    avatarUploadId?: string | null;
    /**
     * 008/FR-043. Setting it changes what the boundary answers on the next read,
     * everywhere at once; the people who already follow you keep their access.
     */
    accountPrivacy?: 'open' | 'private';
  }): Promise<MyProfile> {
    return this.client.call<MyProfile>('patchMe', { body: patch });
  }

  /**
   * FR-048. Irreversible, and the screen that calls it says so. Signs out
   * afterwards so the app is not left holding a token for a person who no
   * longer exists.
   */
  async deleteAccount(): Promise<void> {
    await this.client.call<void>('deleteMe');
    await this.tokens.set(null);
  }

  async signOut(): Promise<void> {
    await this.tokens.set(null);
  }

  async isSignedIn(): Promise<boolean> {
    return (await this.tokens.get()) !== null;
  }

  /**
   * 011/FR-013. WHAT THE APP SHOULD ASK AT LAUNCH, AND DID NOT.
   *
   * `isSignedIn` answers "is there a credential in the store", which is not the
   * same question as "may this person act". A credential that has expired, been
   * revoked by a password reset (FR-021), or was issued by a backend the app no
   * longer points at satisfies `isSignedIn` perfectly — and then every screen
   * 401s and renders empty.
   *
   * That is the defect this product has now shipped in six places under a
   * different name: a surface rendering nothing instead of saying what is wrong.
   * Here it is worse than usual, because "the feed is empty" and "you are
   * signed out" look identical and only one of them is something a person can
   * act on.
   *
   * Returns:
   *   - the profile, when the credential works
   *   - `null` when there was no credential — an ordinary signed-out launch
   *   - `'rejected'` when there WAS one and the server refused it; the
   *     credential is cleared first, so the next launch is an ordinary
   *     signed-out one rather than a repeat of this
   *
   * A network failure is NOT a rejection and is deliberately rethrown. Treating
   * an unreachable backend as "your credential is bad" would sign somebody out
   * of a working account because their train went into a tunnel, and it would
   * discard the credential to do it.
   */
  async resume(): Promise<MyProfile | null | 'rejected'> {
    if ((await this.tokens.get()) === null) return null;
    try {
      return await this.me();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403 || status === 404) {
        await this.tokens.set(null);
        return 'rejected';
      }
      throw err;
    }
  }
}
