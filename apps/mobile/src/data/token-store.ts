import type { TokenStore } from './client';

/**
 * A token that survives a restart.
 *
 * `MemoryTokenStore` is the default, which means a signed-in person is signed
 * out again the moment the app is closed. Nothing caught that: the render tests
 * inject their own data layer, and the HTTP journeys mint a fresh token per
 * actor, so neither exercises what happens on a second launch.
 *
 * Deliberately built on an injected key/value interface rather than importing a
 * storage module directly, so this file stays free of react-native and the
 * browser journeys can drive the same code. The platform supplies the backing
 * store: localStorage on web, and secure storage on a device.
 */
export interface KeyValueStore {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

const KEY = 'sih.auth.token';

export class PersistentTokenStore implements TokenStore {
  private cached: string | null | undefined;

  constructor(private readonly backing: KeyValueStore) {}

  async get(): Promise<string | null> {
    if (this.cached !== undefined) return this.cached;
    try {
      this.cached = (await this.backing.getItem(KEY)) ?? null;
    } catch {
      // A storage read can fail - private mode, a cleared profile, a locked
      // keychain. Signed out is the safe answer; throwing here would break every
      // request rather than one.
      this.cached = null;
    }
    return this.cached;
  }

  async set(token: string | null): Promise<void> {
    this.cached = token;
    try {
      if (token === null) await this.backing.removeItem(KEY);
      else await this.backing.setItem(KEY, token);
    } catch {
      // The in-memory value still holds for this run, so the person stays signed
      // in until they close the app. Losing persistence is better than losing
      // the session.
    }
  }
}

/** Browser backing store. Absent in a non-browser runtime, hence the guard. */
export function browserKeyValueStore(): KeyValueStore | null {
  const ls = (globalThis as { localStorage?: KeyValueStore }).localStorage;
  return ls ?? null;
}
