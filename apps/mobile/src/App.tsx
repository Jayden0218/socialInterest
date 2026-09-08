import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, Text, View } from 'react-native';
import { activePalette as palette, space, textStyle } from './ui/theme';
import { Button, Row } from './ui/primitives';
import { DataProvider, useData } from './data-provider';
import {
  HomeFeedContainer,
  DiscoverContainer,
  NotificationsContainer,
  PostDetailContainer,
  CommentsContainer,
  SafetyContainer,
  PickInterestsContainer,
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
  InboxContainer,
  ConversationContainer,
  OpenConversationContainer,
  NewGroupContainer,
  PlaceContainer,
  CreatePlaceContainer,
  SavedContainer,
} from './screens';
import type { ReportSubject } from './features/safety/SafetyActions';
import { API_BASE_URL } from './config';

export type Tab = 'feed' | 'discover' | 'chats' | 'notifications' | 'profile';

export const TABS: { key: Tab; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'discover', label: 'Discover' },
  // 004/US1. Five tabs is the ceiling, which is why places live INSIDE Discover
  // (one search across interests and places) rather than taking a sixth.
  { key: 'chats', label: 'Chats' },
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
  | { name: 'person'; handle: string }
  | { name: 'shared-post'; postId: string }
  | { name: 'create-interest'; parentId: string; parentName: string }
  // ---- feature 004
  | { name: 'open-conversation'; handle: string }
  // ---- feature 005
  | { name: 'new-group' }
  // otherHandle is null for a group, which has no single other person (005).
  | { name: 'conversation'; conversationId: string; otherHandle: string | null }
  | { name: 'place'; placeId: string }
  | { name: 'create-place'; initialName?: string; initialLocality?: string }
  | { name: 'saved' }
  | { name: 'people-search' }
  // ---- feature 007
  | { name: 'pick-interests' }
  | { name: 'safety'; subject: ReportSubject; subjectId: string; authorHandle?: string };

/**
 * The root fills the viewport AND paints the surface.
 *
 * `flex: 1` alone sized to content, so everything below the last element was the
 * page's own white - invisible while the theme was white, and the first thing
 * you notice against a dark green one. `minHeight: '100%'` makes the root fill
 * under react-native-web without changing native behaviour, where flex already
 * did the right thing.
 */
const appRootStyle = {
  flex: 1,
  minHeight: '100%',
  backgroundColor: palette.bg.base,
} as const;

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <Row
      style={{
        alignItems: 'center',
        gap: space.md,
        padding: space.sm,
        borderBottomWidth: 1,
        borderBottomColor: palette.line.hairline,
      }}
    >
      <Button testID="nav-back" label="Back" variant="secondary" onPress={onBack} />
      <Text style={{ ...textStyle.body, fontWeight: '600', color: palette.text.primary }}>{title}</Text>
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
                /**
                 * 007/FR-014, SC-002. Straight into the cold start, REPLACING
                 * the sign-in screen rather than stacking on it: a back gesture
                 * from the picks must not land on a sign-in form the person has
                 * already completed.
                 *
                 * The screen decides for itself whether it has anything to ask
                 * — an account that has already seeded skips through — so this
                 * is unconditional here and conditional there. Deciding it in
                 * two places is how one of them goes stale.
                 */
                setStack([{ name: 'pick-interests' }]);
              }}
            />
          );
        case 'pick-interests':
          return <PickInterestsContainer onDone={() => setStack([])} />;
        case 'post':
          return (
            <PostDetailContainer
              postId={top.postId}
              onOpenComments={(postId) => requireSignIn({ name: 'comments', postId })}
              onOpenPlace={(placeId) => push({ name: 'place', placeId })}
              onReport={(subjectId, authorHandle) =>
                requireSignIn({ name: 'safety', subject: 'post', subjectId, authorHandle })
              }
              onOpenAuthor={(personHandle) => push({ name: 'person', handle: personHandle })}
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
                onReportDescription={(subjectId) =>
                  requireSignIn({ name: 'safety', subject: 'interest-description', subjectId })
                }
              />
              <Row style={{ padding: space.sm }}>
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
        case 'person':
          // 003/T053. Another person's profile, with a follow control that works.
          return (
            <ProfileContainer
              handle={top.handle}
              isSelf={false}
              onOpenPost={(postId) => push({ name: 'post', postId })}
              // 004/FR-001. The one way into a conversation from inside the
              // product; without it the chat surface is reachable only from an
              // inbox that starts empty.
              onMessage={(personHandle) => requireSignIn({ name: 'open-conversation', handle: personHandle })}
            />
          );
        case 'new-group':
          // 005/FR-018. Replaces itself on the stack rather than pushing, so
          // Back from the new conversation returns to the inbox and not to a
          // half-filled form that would create a second group.
          return signedIn ? (
            <NewGroupContainer
              onCreated={(conversationId, otherHandle) =>
                setStack((st) => [
                  ...st.slice(0, -1),
                  { name: 'conversation', conversationId, otherHandle },
                ])
              }
            />
          ) : (
            <SignedOutNotice onSignIn={() => push({ name: 'sign-in' })} />
          );
        case 'open-conversation':
          return (
            <OpenConversationContainer
              handle={top.handle}
              onOpened={(conversationId: string, otherHandle: string | null) =>
                setStack((st) => [
                  ...st.slice(0, -1),
                  { name: 'conversation', conversationId, otherHandle },
                ])
              }
            />
          );
        case 'saved':
          return signedIn ? (
            <SavedContainer onOpenPost={(postId) => push({ name: 'post', postId })} />
          ) : (
            <SignedOutNotice onSignIn={() => push({ name: 'sign-in' })} />
          );
        case 'place':
          return (
            <PlaceContainer
              placeId={top.placeId}
              signedIn={signedIn}
              onOpenPost={(postId) => push({ name: 'post', postId })}
              /**
               * 005/FR-014. ONE callback, two subject types, told apart by the
               * shape of the id: a review's is `<placeId>:<userId>`, a place's
               * is a bare id. That is the same discriminator the API uses, so
               * the client cannot report a review as a place or the reverse.
               */
              onReport={(subjectId) =>
                requireSignIn({
                  name: 'safety',
                  subject: subjectId.includes(':') ? 'review' : 'place',
                  subjectId,
                })
              }
            />
          );
        case 'create-place':
          return signedIn ? (
            <CreatePlaceContainer
              {...(top.initialName ? { initialName: top.initialName } : {})}
              {...(top.initialLocality ? { initialLocality: top.initialLocality } : {})}
              onCreated={(place) => setStack((st) => [...st.slice(0, -1), { name: 'place', placeId: place.placeId }])}
            />
          ) : (
            <SignedOutNotice onSignIn={() => push({ name: 'sign-in' })} />
          );
        case 'conversation':
          return signedIn ? (
            <ConversationContainer
              conversationId={top.conversationId}
              onOpenPost={(postId) => push({ name: 'post', postId })}
              onReport={(subjectId) => push({ name: 'safety', subject: 'message', subjectId })}
              // 005/FR-021. Leaving makes this screen a 404 to you, so go back
              // rather than stand on a conversation the server now refuses.
              onLeft={pop}
            />
          ) : (
            <SignedOutNotice onSignIn={() => push({ name: 'sign-in' })} />
          );
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
      <View testID="app-root" style={appRootStyle}>
        <Header title={top.name} onBack={pop} />
        {body}
      </View>
    );
  }

  return (
    <View testID="app-root" style={appRootStyle}>
      {/*
        An EXHAUSTIVE switch, not a chain of `tab === 'x' ? ... : null`.

        The chain compiled fine with a tab that had no body and rendered an
        empty screen - the same shape as the four defects where a screen existed
        and nothing mounted it. `never` here turns "added a tab, forgot the
        body" into a type error, and tabsRenderBody() in the tests asserts every
        TABS entry actually produces something.
      */}
      {((): React.ReactElement => {
        switch (tab) {
          case 'feed':
            return (
              <View style={{ flex: 1 }}>
                <HomeFeedContainer
                  onEmptyAction={() => setTab('discover')}
                  onOpenPost={(postId) => push({ name: 'post', postId })}
                />
              </View>
            );
          case 'discover':
            return (
              <DiscoverContainer
                onSelect={(interestId) => push({ name: 'interest', interestId })}
                onSelectPlace={(placeId) => push({ name: 'place', placeId })}
                onSelectPerson={(handle) => push({ name: 'person', handle })}
              />
            );
          case 'chats':
            return signedIn ? (
              <InboxContainer
                onOpen={(conversationId, otherHandle) =>
                  push({ name: 'conversation', conversationId, otherHandle })
                }
                onNewGroup={() => push({ name: 'new-group' })}
              />
            ) : (
              <SignedOutNotice onSignIn={() => push({ name: 'sign-in' })} />
            );
          case 'notifications':
            return <NotificationsContainer onOpen={(id) => push({ name: 'post', postId: id })} />;
          case 'profile':
            return signedIn ? (
              <View style={{ flex: 1 }}>
                <ProfileContainer
                  handle="me"
                  isSelf
                  onOpenPost={(postId) => push({ name: 'post', postId })}
                />
                <Row style={{ padding: space.sm }}>
                  <Button
                    testID="open-edit-profile"
                    label="Edit profile"
                    variant="secondary"
                    onPress={() => push({ name: 'edit-profile' })}
                  />
                  {/* 004/FR-038. The only route to a saved list - it is reachable
                      as "mine" and nowhere else. */}
                  <Button
                    testID="open-saved"
                    label="Saved"
                    variant="secondary"
                    onPress={() => push({ name: 'saved' })}
                  />
                </Row>
              </View>
            ) : (
              <SignedOutNotice onSignIn={() => push({ name: 'sign-in' })} />
            );
          default: {
            const unreachable: never = tab;
            return unreachable;
          }
        }
      })()}

      <Row style={{ padding: space.sm, gap: space.sm }}>
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

      <Row style={{ borderTopWidth: 1, borderTopColor: palette.line.hairline, padding: space.sm }}>
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
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg.base }}>
        <StatusBar />
        <Shell />
      </SafeAreaView>
    </DataProvider>
  );
}
