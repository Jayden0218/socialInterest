import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  createAppData,
  MemoryTokenStore,
  PersistentTokenStore,
  PersistentSettingsStore,
  browserKeyValueStore,
  deviceKeyValueStore,
  type AppData,
  type TokenStore,
} from './data';

/**
 * Pick a backing store for the current runtime.
 *
 * On web, localStorage keeps a person signed in across reloads. On a device,
 * AsyncStorage now does the same — until 009 it did NOT, because
 * `browserKeyValueStore()` was the only implementation and returns null off the
 * web, so a device session was memory-only and signed out on every relaunch.
 * That gap was recorded here in this comment for five features before anything
 * needed it badly enough to close it.
 *
 * Null is still possible — a runtime with neither — and every caller treats that
 * as "nothing persists" rather than as an error.
 */
function defaultKeyValueStore() {
  return browserKeyValueStore() ?? deviceKeyValueStore();
}

function defaultTokenStore(): TokenStore | undefined {
  const backing = defaultKeyValueStore();
  return backing ? new PersistentTokenStore(backing) : undefined;
}

/**
 * The token store and the settings store, built over ONE backing store and
 * sharing one token store instance.
 *
 * Sharing is the point rather than an economy: `PersistentSettingsStore` clears
 * the credential when the address changes, and it can only clear the credential
 * the app is actually using. Two instances over the same key would drift the
 * moment either cached.
 *
 * Built here, at the composition root, because `contracts/backend-address.md` §6
 * says the address is read where the data layer is constructed and nowhere else.
 */
export function createStores(fallbackBaseUrl: string): {
  tokens: TokenStore;
  settings: PersistentSettingsStore | null;
} {
  const backing = defaultKeyValueStore();
  const tokens = backing ? new PersistentTokenStore(backing) : new MemoryTokenStore();
  return {
    tokens,
    settings: backing ? new PersistentSettingsStore(backing, fallbackBaseUrl, tokens) : null,
  };
}

/**
 * Supplies the data layer to the screens.
 *
 * The screens themselves stay presentational and prop-driven - that is what lets
 * them be render-tested without a network, and what lets apps/e2e drive the same
 * data modules in Node without React. Containers sit between the two.
 */
const DataContext = createContext<AppData | null>(null);

export function DataProvider({
  children,
  baseUrl,
  tokens,
  value,
}: {
  children: ReactNode;
  /** A string, or a getter resolved per request — see `DataClientOptions.baseUrl`. */
  baseUrl?: string | (() => string);
  tokens?: TokenStore;
  /** Injected directly in tests, so no network is involved. */
  value?: AppData;
}) {
  const data = useMemo(
    () => {
      if (value) return value;
      const store = tokens ?? defaultTokenStore();
      return createAppData({ baseUrl: baseUrl ?? '', ...(store ? { tokens: store } : {}) });
    },
    [value, baseUrl, tokens],
  );
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}

export function useData(): AppData {
  const data = useContext(DataContext);
  if (!data) throw new Error('useData must be used inside a DataProvider');
  return data;
}
