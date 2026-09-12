import type { TokenStore } from './client';
import type { KeyValueStore } from './token-store';

/**
 * Where the app points, and what happens to your credential when that changes.
 *
 * 009/US1. Implements `specs/009-session-server/contracts/backend-address.md`.
 *
 * Built on the same injected key/value interface as `PersistentTokenStore`,
 * rather than importing a storage module, so this file stays free of
 * react-native and the browser journeys drive the same code. The platform
 * supplies the backing store.
 */

/** The one key. `data-model.md` names it; `authenticated.spec.ts` relies on the token's. */
export const BACKEND_URL_KEY = 'sih.backend.url';

/**
 * Two addresses that differ only by a trailing slash or by whitespace are the
 * SAME address, and this is not tidiness.
 *
 * Contract §3 says re-entering an unchanged value must not sign a person out.
 * The value is typed on a phone, where a trailing slash is a coin flip and a
 * leading space arrives free with most paste actions. Without this, retyping
 * what was already there discards a working credential and the person is signed
 * out for agreeing with the app.
 */
function normalise(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export class PersistentSettingsStore {
  private cached: string | null | undefined;

  constructor(
    private readonly backing: KeyValueStore,
    /** The built-in default from `config.ts`. Level two of two. */
    private readonly fallback: string,
    /**
     * Held here so that invalidation happens in ONE place.
     *
     * A credential belongs to the address that issued it. Clearing it at each
     * call site instead would be a rule applied at two places, which is a rule
     * that will be applied at one of them — the same argument as one
     * `VisibilityFilter` and one `profile.projection.ts`.
     */
    private readonly tokens: TokenStore,
  ) {}

  /** Contract §1: stored wins, the built-in default fills in. Two levels, no override. */
  async getBaseUrl(): Promise<string> {
    if (this.cached !== undefined) return this.cached ?? this.fallback;
    try {
      this.cached = (await this.backing.getItem(BACKEND_URL_KEY)) ?? null;
    } catch {
      // Private mode, a cleared profile, a locked keychain. The built-in default
      // is the safe answer; throwing here would break the app rather than one
      // read, which is the behaviour `PersistentTokenStore` already chose.
      this.cached = null;
    }
    return this.cached ?? this.fallback;
  }

  /**
   * The address, if it can be known WITHOUT waiting. `null` means it cannot.
   *
   * Added because the first version of `App` rendered a blank frame on every
   * launch while an await resolved — which `screens.test.tsx` caught by finding
   * no `app-root`. On the web that wait is pure loss: `localStorage` answers
   * synchronously, so there was nothing to wait for and a person saw an empty
   * screen anyway.
   *
   * A device's store is genuinely asynchronous, so `null` is the honest answer
   * there and the caller waits. This is a fast path, not a second source of
   * truth: it writes the same cache `getBaseUrl` reads.
   */
  peekBaseUrl(): string | null {
    if (this.cached !== undefined) return this.cached ?? this.fallback;
    try {
      const value = this.backing.getItem(BACKEND_URL_KEY);
      if (value !== null && typeof (value as Promise<unknown>)?.then === 'function') return null;
      this.cached = (value as string | null) ?? null;
      return this.cached ?? this.fallback;
    } catch {
      this.cached = null;
      return this.fallback;
    }
  }

  /**
   * Contract §2 and §3. Persist the address, and discard the credential if — and
   * only if — the address actually changed.
   */
  async setBaseUrl(next: string): Promise<void> {
    const current = await this.getBaseUrl();
    const value = normalise(next);

    if (value !== normalise(current)) {
      // A credential issued by another session is not merely stale, it is
      // cryptographically rejected: every session generates its own signing
      // secret (FR-015). Keeping it would leave the app believing it is signed
      // in while every request fails — which FR-004 forbids presenting as an
      // absence of content, and which is the most likely way to end up there.
      await this.tokens.set(null);
    }

    this.cached = value;
    try {
      await this.backing.setItem(BACKEND_URL_KEY, value);
    } catch {
      // The in-memory value still holds for this run, so the person keeps using
      // the address they just set. Losing persistence beats losing the session.
    }
  }
}
