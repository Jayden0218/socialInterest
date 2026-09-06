import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, Text, View } from 'react-native';
import { theme } from './ui/theme';
import { Button, Row } from './ui/primitives';
import { DataProvider, useData } from './data-provider';
import {
  HomeFeedContainer,
  DiscoverContainer,
  NotificationsContainer,
  PostDetailContainer,
  CommentsContainer,
  SafetyContainer,
  SignInContainer,
  SignedOutNotice,
  InterestContainer,
  ProfileContainer,
  ComposeFlowContainer,
  ShareContainer,
  CreateInterestContainer,
  EditPostContainer,
  EditProfileContainer,
  SharedPostContainer,
} from './screens';
import { API_BASE_URL } from './config';

export type Tab = 'feed' | 'discover' | 'notifications' | 'profile';

export const TABS: { key: Tab; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'discover', label: 'Discover' },
  { key: 'notifications', label: 'Activity' },
  { key: 'profile', label: 'You' },
];

/**
 * A screen pushed on top of the tabs.
 *
 * Every one of these screens already existed and was render-tested. None was
 * reachable: the shell mounted three containers and passed `() => undefined` for
 * the callbacks that would have opened the rest, so on a device the product was
 * a read-only three-tab shell - no sign in, no publish, no comments, no report,
 * no block. The unit tests could not see it because they render each screen
 * directly, and apps/e2e could not see it because it drives the data layer
 * rather than the UI.
 */
export type Route =
  | { name: 'sign-in' }
  | { name: 'post'; postId: string }
  | { name: 'comments'; postId: string }
  | { name: 'interest'; interestId: string }
  | { name: 'compose' }
  | { name: 'share'; postId: string }
  | { name: 'edit-post'; postId: string }
  | { name: 'edit-profile' }
  | { name: 'shared-post'; postId: string }
  | { name: 'create-interest'; parentId: string; parentName: string }
  | { name: 'safety'; subject: 'post' | 'comment' | 'interest'; subjectId: string; authorHandle?: string };

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <Row
      style={{
        alignItems: 'center',
        gap: theme.space.md,
        padding: theme.space.sm,
        borderBottomWidth: 1,
        borderBottomColor: theme.color.border,
      }}
    >
      <Button testID="nav-back" label="Back" variant="secondary" onPress={onBack} />
      <Text style={{ fontSize: theme.font.md, fontWeight: '600', color: theme.color.text }}>{title}</Text>
    </Row>
  );
}

/** Exported so the navigation between screens can be tested without the provider. */
export function Shell() {
  const data = useData();
  const [tab, setTab] = useState<Tab>('feed');
  const [stack, setStack] = useState<Route[]>([]);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let live = true;
    void data.session.isSignedIn().then((yes) => live && setSignedIn(yes));
    return () => {
      live = false;
    };
  }, [data]);

  /**
   * A share link opens the app AT a post (FR-041, FR-042).
   *
   * Without this the shared-post screen is unreachable by construction: nothing
   * can put the app into that state. On web the id comes from the address; a
   * native build would supply the same id from its intent or universal link, and
   * only this effect would change.
   */
  useEffect(() => {
    const loc = (globalThis as { location?: { pathname?: string; hash?: string } }).location;
    if (!loc) return;
    const match = /[/#]p\/([A-Za-z0-9_-]+)/.exec(`${loc.pathname ?? ''}${loc.hash ?? ''}`);
    if (match?.[1]) setStack([{ name: 'shared-post', postId: match[1] }]);
  }, []);

  const push = useCallback((route: Route) => setStack((s) => [...s, route]), []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const top = stack[stack.length - 1];

  // A surface that needs an identity says so and offers the way in, rather than
  // rendering an empty list that looks like "nothing here yet".
  const requireSignIn = useCallback(
    (route: Route) => push(signedIn ? route : { name: 'sign-in' }),
    [push, signedIn],
  );

  if (top) {
    const body = (() => {
      switch (top.name) {
        case 'sign-in':
          return (
            <SignInContainer
              onSignedIn={() => {
                setSignedIn(true);
                pop();
              }}
            />
          );
        case 'post':
          return (
            <PostDetailContainer
              postId={top.postId}
              onOpenComments={(postId) => requireSignIn({ name: 'comments', postId })}
              onReport={(subjectId, authorHandle) =>
                requireSignIn({ name: 'safety', subject: 'post', subjectId, authorHandle })
              }
              onShare={(shareId) => push({ name: 'share', postId: shareId })}
              onEdit={(editId) => push({ name: 'edit-post', postId: editId })}
            />
          );
        case 'comments':
          return signedIn ? (
            <CommentsContainer postId={top.postId} />
          ) : (
            <SignedOutNotice onSignIn={() => push({ name: 'sign-in' })} />
          );
        case 'interest':
          return (
            <View style={{ flex: 1 }}>
              <InterestContainer
                interestId={top.interestId}
                onOpenSubInterest={(id) => push({ name: 'interest', interestId: id })}
                onOpenPost={(postId) => push({ name: 'post', postId })}
              />
              <Row style={{ padding: theme.space.sm }}>
                <Button
                  testID="open-create-interest"
                  label="Propose a sub-interest"
                  variant="secondary"
                  onPress={() =>
                    requireSignIn({
                      name: 'create-interest',
                      parentId: top.interestId,
                      parentName: '',
                    })
                  }
                />
              </Row>
            </View>
          );
        case 'compose':
          return signedIn ? (
            <ComposeFlowContainer onPublished={() => pop()} />
          ) : (
            <SignedOutNotice onSignIn={() => push({ name: 'sign-in' })} />
          );
        case 'share':
          return <ShareContainer postId={top.postId} onDone={pop} />;
        case 'edit-post':
          return <EditPostContainer postId={top.postId} onDone={pop} />;
        case 'edit-profile':
          return <EditProfileContainer onDone={pop} />;
        case 'shared-post':
          // Landed here from a share link, so Back would go nowhere: the action
          // is to enter the app, not to return to a screen that was never open.
          return (
            <SharedPostContainer postId={top.postId} onJoin={() => setStack([])} />
          );
        case 'create-interest':
          return signedIn ? (
            <CreateInterestContainer
              parentId={top.parentId}
              parentName={top.parentName}
              onCreated={(interestId) => setStack([{ name: 'interest', interestId }])}
            />
          ) : (
            <SignedOutNotice onSignIn={() => push({ name: 'sign-in' })} />
          );
        case 'safety':
          return (
            <SafetyContainer
              subject={top.subject}
              subjectId={top.subjectId}
              {...(top.authorHandle ? { authorHandle: top.authorHandle } : {})}
              onDone={pop}
            />
          );
      }
    })();

    return (
      <View testID="app-root" style={{ flex: 1 }}>
        <Header title={top.name} onBack={pop} />
        {body}
      </View>
    );
  }

  return (
    <View testID="app-root" style={{ flex: 1 }}>
      {tab === 'feed' ? (
        <View style={{ flex: 1 }}>
          <HomeFeedContainer
            onEmptyAction={() => setTab('discover')}
            onOpenPost={(postId) => push({ name: 'post', postId })}
          />
        </View>
      ) : null}

      {tab === 'discover' ? (
        <DiscoverContainer onSelect={(interestId) => push({ name: 'interest', interestId })} />
      ) : null}

      {tab === 'notifications' ? (
        <NotificationsContainer onOpen={(id) => push({ name: 'post', postId: id })} />
      ) : null}

      {tab === 'profile' ? (
        signedIn ? (
          <View style={{ flex: 1 }}>
            <ProfileContainer
              handle="me"
              isSelf
              onOpenPost={(postId) => push({ name: 'post', postId })}
            />
            <Row style={{ padding: theme.space.sm }}>
              <Button
                testID="open-edit-profile"
                label="Edit profile"
                variant="secondary"
                onPress={() => push({ name: 'edit-profile' })}
              />
            </Row>
          </View>
        ) : (
          <SignedOutNotice onSignIn={() => push({ name: 'sign-in' })} />
        )
      ) : null}

      <Row style={{ padding: theme.space.sm, gap: theme.space.sm }}>
        <Button
          testID="open-compose"
          label="New post"
          onPress={() => requireSignIn({ name: 'compose' })}
        />
        {signedIn ? null : (
          <Button
            testID="open-sign-in"
            label="Sign in"
            variant="secondary"
            onPress={() => push({ name: 'sign-in' })}
          />
        )}
      </Row>

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
  );
}

/**
 * App shell.
 *
 * Still deliberately thin, and still dependency-free: a stack of routes and a
 * Back control, not a navigator. The screens hold the product rules. A real
 * build swaps this for react-navigation without any screen changing.
 *
 * The API base URL comes from app.config.ts and is inlined at build time. On an
 * emulator that is 10.0.2.2 - the host loopback - so the app reaches an API on
 * the same machine. A physical device needs an address it can actually route to.
 */
export default function App() {
  return (
    <DataProvider baseUrl={API_BASE_URL}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg }}>
        <StatusBar />
        <Shell />
      </SafeAreaView>
    </DataProvider>
  );
}
