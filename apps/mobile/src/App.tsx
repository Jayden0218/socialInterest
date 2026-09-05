import { useState } from 'react';
import { SafeAreaView, ScrollView, StatusBar, Text, View } from 'react-native';
import { theme } from './ui/theme';
import { Button, Row } from './ui/primitives';
import { HomeFeedScreen } from './features/feed/HomeFeedScreen';
import { InterestSearchScreen } from './features/discover/InterestSearchScreen';
import { NotificationsScreen } from './features/notifications/NotificationsScreen';
import { initialPagedState } from './components/PagedPostList';
import type { Post } from '@sih/shared';

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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <StatusBar />
      <View testID="app-root" style={{ flex: 1 }}>
        {tab === 'feed' ? (
          <HomeFeedScreen
            state={initialPagedState<Post>()}
            onLoadMore={() => undefined}
            onEmptyAction={() => setTab('discover')}
            renderPost={() => <View />}
          />
        ) : null}

        {tab === 'discover' ? (
          <InterestSearchScreen query="" results={[]} onQueryChange={() => undefined} onSelect={() => undefined} />
        ) : null}

        {tab === 'notifications' ? (
          <NotificationsScreen
            notifications={[]}
            prefs={{ reaction: true, comment: true, follow: true }}
            onOpen={() => undefined}
            onEditPrefs={() => undefined}
          />
        ) : null}

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
  );
}
