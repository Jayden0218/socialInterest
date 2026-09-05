import type { PublicProfile } from '@sih/shared';
import type { DataClient, TokenStore } from './client';

/**
 * GET /me returns more than PublicProfile: the counts and preferences that are
 * only yours to see. Typing it as PublicProfile would have hidden those fields
 * from every caller.
 */
export interface MyProfile extends PublicProfile {
  interestFollowCount: number;
  followerCount: number;
  followingCount: number;
  notificationPrefs: { reaction: boolean; comment: boolean; follow: boolean };
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

  async signIn(token: string): Promise<MyProfile> {
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

  updateProfile(patch: { displayName?: string; bio?: string }): Promise<MyProfile> {
    return this.client.call<MyProfile>('patchMe', { body: patch });
  }

  async signOut(): Promise<void> {
    await this.tokens.set(null);
  }

  async isSignedIn(): Promise<boolean> {
    return (await this.tokens.get()) !== null;
  }
}
