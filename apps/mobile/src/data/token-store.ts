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

/**
 * Device backing store — 009/FR-002.
 *
 * THE HALF THAT WAS MISSING. Until this existed, `browserKeyValueStore()` was
 * the ONLY implementation of `KeyValueStore`: it reads `globalThis.localStorage`
 * and returns null anywhere else, so on a device `defaultTokenStore()` returned
 * undefined, the token store fell back to memory, and the app signed out on
 * every relaunch. `data-provider.tsx` carried that as a known gap in its own
 * comment for five features. A persistence interface with a web half and no
 * device half is the declared-half-with-no-other-half shape this project keeps
 * paying for.
 *
 * REQUIRED LAZILY, INSIDE A TRY, for the reason `useMediaLibrary.loadPicker`
 * does the same: the module is native, so a runtime without it — the jest
 * preset, react-native-web, the browser journeys — must degrade to "no backing
 * store" rather than fail to load. Returning null here is honest and already
 * handled: `PersistentTokenStore` treats a missing store as signed out rather
 * than throwing, because a storage failure must break one read and not every
 * request.
 *
 * AsyncStorage's methods return promises, which `KeyValueStore` already allows —
 * the interface was written that way before anything needed it.
 */
export function deviceKeyValueStore(): KeyValueStore | null {
  try {
    const mod = require('@react-native-async-storage/async-storage') as {
      default?: KeyValueStore;
    };
    const store = mod?.default;
    return store && typeof store.getItem === 'function' ? store : null;
  } catch {
    return null;
  }
}
