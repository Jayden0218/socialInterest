import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  createAppData,
  PersistentTokenStore,
  browserKeyValueStore,
  type AppData,
  type TokenStore,
} from './data';

/**
 * Pick a token store for the current runtime.
 *
 * On web, localStorage keeps a person signed in across reloads. On a device
 * there is no backing store wired yet - react-native has no localStorage, and
 * secure storage is not installed - so a device session is still memory-only and
 * signs out on relaunch. That is a real remaining gap, recorded rather than
 * hidden behind a store that silently forgets.
 */
function defaultTokenStore(): TokenStore | undefined {
  const backing = browserKeyValueStore();
  return backing ? new PersistentTokenStore(backing) : undefined;
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
  baseUrl?: string;
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
