import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createAppData, type AppData, type TokenStore } from './data';

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
    () => value ?? createAppData({ baseUrl: baseUrl ?? '', ...(tokens ? { tokens } : {}) }),
    [value, baseUrl, tokens],
  );
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}

export function useData(): AppData {
  const data = useContext(DataContext);
  if (!data) throw new Error('useData must be used inside a DataProvider');
  return data;
}
