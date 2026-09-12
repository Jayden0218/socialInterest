import { PersistentSettingsStore } from '../data/settings-store';
import type { KeyValueStore } from '../data/token-store';
import type { TokenStore } from '../data/client';

/**
 * 009, `contracts/backend-address.md` §1-§4.
 *
 * WHICH OF THESE IS A MEANINGFUL RED, because the two are not the same and
 * tasks.md says so out loud.
 *
 * The resolution and invalidation cases below are red because
 * `data/settings-store.ts` does not exist yet. That is a red for a missing file,
 * which proves nothing on its own - it is the same empty red that
 * `hooks-before-return.test.ts` produced when its subject moved out from under
 * it and it reported zero offenders over an empty list.
 *
 * The LAST case is the meaningful one. "a store with no browser backing keeps
 * nothing" fails against the SHIPPED product for the product's own reason:
 * `browserKeyValueStore()` is the only implementation of `KeyValueStore`, it
 * reads `globalThis.localStorage`, and it returns null anywhere else. So on a
 * device `defaultTokenStore()` returns undefined, the token store falls back to
 * memory, and the app signs out on every relaunch. `data-provider.tsx` records
 * that in its own comment as "a real remaining gap".
 *
 * Nothing here touches AsyncStorage. The seam is an injected key/value
 * interface precisely so these tests need no native module, which is the same
 * reason `token-store.ts` was built that way in the first place.
 */

/** A backing store that behaves; stands in for the device's. */
function fakeBacking(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    store: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    } satisfies KeyValueStore,
    map,
  };
}

/** A backing store that throws on every call - private mode, locked keychain. */
const hostileBacking: KeyValueStore = {
  getItem: () => {
    throw new Error('storage unavailable');
  },
  setItem: () => {
    throw new Error('storage unavailable');
  },
  removeItem: () => {
    throw new Error('storage unavailable');
  },
};

function recordingTokens(initial: string | null = 'token-from-session-a') {
  const state = { token: initial, clears: 0 };
  const tokens: TokenStore = {
    get: () => state.token,
    set: (t) => {
      if (t === null) state.clears += 1;
      state.token = t;
    },
  };
  return { tokens, state };
}

const DEFAULT = 'http://127.0.0.1:3000/v1';

describe('the backend address on the device (contract: backend-address.md)', () => {
  describe('§1 resolution — stored wins, default fills in, two levels only', () => {
    it('falls back to the built-in default when nothing is stored', async () => {
      const { store } = fakeBacking();
      const settings = new PersistentSettingsStore(store, DEFAULT, recordingTokens().tokens);
      await expect(settings.getBaseUrl()).resolves.toBe(DEFAULT);
    });

    it('prefers a stored address over the built-in default', async () => {
      const { store } = fakeBacking({ 'sih.backend.url': 'https://session-a.example/v1' });
      const settings = new PersistentSettingsStore(store, DEFAULT, recordingTokens().tokens);
      await expect(settings.getBaseUrl()).resolves.toBe('https://session-a.example/v1');
    });
  });

  describe('§2 persistence', () => {
    it('a set address is readable by a store built fresh over the same backing', async () => {
      const { store } = fakeBacking();
      const tokensA = recordingTokens();
      await new PersistentSettingsStore(store, DEFAULT, tokensA.tokens).setBaseUrl(
        'https://session-a.example/v1',
      );

      // A new instance over the same backing is what a relaunch looks like.
      const afterRelaunch = new PersistentSettingsStore(store, DEFAULT, recordingTokens().tokens);
      await expect(afterRelaunch.getBaseUrl()).resolves.toBe('https://session-a.example/v1');
    });

    it('a storage failure falls back to the default rather than throwing', async () => {
      const settings = new PersistentSettingsStore(hostileBacking, DEFAULT, recordingTokens().tokens);
      await expect(settings.getBaseUrl()).resolves.toBe(DEFAULT);
    });

    it('a storage failure on write leaves the value usable for this run', async () => {
      const settings = new PersistentSettingsStore(hostileBacking, DEFAULT, recordingTokens().tokens);
      await expect(settings.setBaseUrl('https://session-a.example/v1')).resolves.toBeUndefined();
      await expect(settings.getBaseUrl()).resolves.toBe('https://session-a.example/v1');
    });
  });

  describe('§3 changing the address discards the credential', () => {
    it('clears the credential when the address actually changes', async () => {
      const { store } = fakeBacking({ 'sih.backend.url': 'https://session-a.example/v1' });
      const { tokens, state } = recordingTokens();
      await new PersistentSettingsStore(store, DEFAULT, tokens).setBaseUrl(
        'https://session-b.example/v1',
      );
      expect(state.clears).toBe(1);
      expect(state.token).toBeNull();
    });

    it('does NOT clear the credential when the same address is entered again', async () => {
      const { store } = fakeBacking({ 'sih.backend.url': 'https://session-a.example/v1' });
      const { tokens, state } = recordingTokens();
      await new PersistentSettingsStore(store, DEFAULT, tokens).setBaseUrl(
        'https://session-a.example/v1',
      );
      expect(state.clears).toBe(0);
      expect(state.token).toBe('token-from-session-a');
    });

    it('treats the built-in default as the current address when nothing is stored', async () => {
      // Otherwise a first-run person who accepts the default is signed out for
      // agreeing with it.
      const { store } = fakeBacking();
      const { tokens, state } = recordingTokens();
      await new PersistentSettingsStore(store, DEFAULT, tokens).setBaseUrl(DEFAULT);
      expect(state.clears).toBe(0);
    });
  });

});
