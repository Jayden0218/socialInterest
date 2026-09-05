import { useState } from 'react';
import { SafeAreaView, ScrollView, StatusBar, Text, View } from 'react-native';
import { theme } from './ui/theme';
import { Button, Row } from './ui/primitives';
import { DataProvider } from './data-provider';
import { HomeFeedContainer, DiscoverContainer, NotificationsContainer } from './screens';
import { API_BASE_URL } from './config';

export type Tab = 'feed' | 'discover' | 'notifications';

export const TABS: { key: Tab; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'discover', label: 'Discover' },
  { key: 'notifications', label: 'Activity' },
];

/**
 * App shell.
 *
 * Deliberately thin: the screens hold the product rules, and this only decides
 * which is on screen. A real build swaps this for a navigator; keeping it
 * dependency-free means the screens stay testable without one.
 *
 * Note the API base URL comes from app.config.ts. A device cannot reach an API
 * running in a cloud sandbox — there is no inbound route — so this is pointed at
 * a stack running on the developer's own machine.
 */
export default function App() {
  const [tab, setTab] = useState<Tab>('feed');

  return (
    <DataProvider baseUrl={API_BASE_URL}>
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <StatusBar />
      <View testID="app-root" style={{ flex: 1 }}>
        {tab === 'feed' ? <HomeFeedContainer onEmptyAction={() => setTab('discover')} /> : null}

        {tab === 'discover' ? <DiscoverContainer onSelect={() => undefined} /> : null}

        {tab === 'notifications' ? <NotificationsContainer onOpen={() => undefined} /> : null}

        <Row style={{ borderTopWidth: 1, borderTopColor: theme.color.border, padding: theme.space.sm }}>
          {TABS.map((t) => (
            <View key={t.key} style={{ flex: 1 }}>
              <Button
                testID={`tab-${t.key}`}
                label={t.label}
                variant={tab === t.key ? 'primary' : 'secondary'}
                onPress={() => setTab(t.key)}
              />
            </View>
          ))}
        </Row>
      </View>
    </SafeAreaView>
    </DataProvider>
  );
}
