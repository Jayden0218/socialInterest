import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StatusBar, Text, View } from 'react-native';
import { activePalette as palette, radius, space, textStyle, MIN_TOUCH_TARGET } from './ui/theme';
import { Button, Row } from './ui/primitives';
import { Icon } from './ui/Icon';
import type { IconName } from './ui/icons';
import { DataProvider, createStores, useData } from './data-provider';
import {
  HomeFeedContainer,
  DiscoverContainer,
  NotificationsContainer,
  PostDetailContainer,
  CommentsContainer,
  SafetyContainer,
  ModerationNoticesContainer,
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
import { ADDRESS_IS_COMPILED_IN, API_BASE_URL } from './config';
import { OVERLAY_SCREENS } from './overlay/screens';

export type Tab = 'feed' | 'discover' | 'chats' | 'notifications' | 'profile';

/**
 * The tab bar, in the order the design draws it.
 *
 * `discover` is labelled EXPLORE — the artboards' word, and the better one: you
 * explore a catalogue, you discover by accident, and 007's whole premise is
 * that the accidental part is the feed's job now. The key is unchanged, because
 * `tab-discover` is in the testID snapshot and in the Maestro flows and marks
 * the same thing.
 */
export const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'feed', label: 'Feed', icon: 'home' },
  { key: 'discover', label: 'Explore', icon: 'explore' },
  // 004/US1. Five tabs is the ceiling, which is why places live INSIDE Explore
  // (one search across interests and places) rather than taking a sixth.
  { key: 'chats', label: 'Chats', icon: 'chats' },
  { key: 'notifications', label: 'Activity', icon: 'activity' },
  { key: 'profile', label: 'You', icon: 'profile' },
];

/**
 * One tab: an ICON above a label, in the accent when active and muted when not.
 *
 * IT WAS AN 8x8 DOT UNTIL 012/T009, and that one fact explains more of the
 * owner's "the UI is very bad" than every skeleton and empty state in this
 * feature combined. Material Design 3 is unambiguous that a navigation
 * destination is an icon AND a label; every application on the phone this is
 * installed beside follows it, so a person has been trained to read a row of
 * icons as navigation. A row of dots reads as a prototype, because that is what
 * it was (012/R8, FR-028).
 *
 * A component rather than five copies, because the accessibility state and the
 * tap target are the parts most likely to be forgotten in a copy — and a tab
 * that is 20 points tall is the shipped defect 006 found under every post.
 */
function TabButton({
  tab,
  active,
  onPress,
}: {
  tab: { key: Tab; label: string; icon: IconName };
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={`tab-${tab.key}`}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={tab.label}
      onPress={onPress}
      style={{ flexGrow: 1, alignItems: 'center', gap: space.xs, minHeight: MIN_TOUCH_TARGET }}
    >
      {/*
        Decorative: the label beneath says the same thing, and `accessibilityLabel`
        on the Pressable already names the destination. Labelling the icon too
        would have a screen reader read every tab twice.
      */}
      <Icon
        name={tab.icon}
        size="nav"
        color={active ? palette.intent.accent : palette.text.muted}
      />
      <Text
        style={{
          ...textStyle.tab,
          fontWeight: active ? '600' : '500',
          color: active ? palette.intent.accent : palette.text.muted,
        }}
      >
        {tab.label}
      </Text>
    </Pressable>
  );
}

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
  | { name: 'safety'; subject: ReportSubject; subjectId: string; authorHandle?: string }
  // ---- feature 008
  | { name: 'moderation-notices' }
  /**
   * A downstream fork's own destination. Empty upstream — see
   * ./overlay/README.md.
   *
   * ONE variant for all of them, rather than widening this union: `Route` stays
   * a closed discriminated union, every existing case keeps its types, and a
   * fork adding a screen never edits the lines upstream edits. `screen` is the
   * key into `OVERLAY_SCREENS`.
   */
  | { name: 'overlay'; screen: string; params?: Record<string, unknown> };

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

/**
 * The header's title.
 *
 * Every base route's `name` reads as its own title, which is why this was
 * `top.name` inline. An overlay route's name is the literal `'overlay'` for all
 * of them, so its title comes from the registry — without this every fork
 * screen would head the bar with the word "overlay".
 */
function headerTitle(route: Route): string {
  if (route.name !== 'overlay') return route.name;
  return OVERLAY_SCREENS[route.screen]?.title ?? route.screen;
}

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

/**
 * Exported so the navigation between screens can be tested without the provider.
 *
 * `initialStack` is where the app starts, and it defaults to the tabs. It is the
 * same capability the share-link effect below already uses — that one replaces
 * the stack from the address — made explicit, because an OVERLAY route has no
 * other way in: nothing upstream pushes one (a fork's own screen does), so
 * without this the overlay case could not be reached to be tested at all, and an
 * untested seam is one that is broken the first time a fork uses it.
 */
export function Shell({
  initialStack = [],
  backend,
}: {
  initialStack?: Route[];
  /**
   * The address the app is pointed at, and the way to change it (009/US1).
   *
   * OPTIONAL, and absent means the sign-in screen shows no address field. That
   * is deliberate: a field with no handler behind it would be a control that
   * does nothing, which is the declared-half-with-no-other-half shape this
   * project has now found seven times. Tests that render `Shell` to exercise
   * navigation pass nothing and correctly see no field.
   */
  backend?: { address: string; onChange: (next: string) => Promise<void> };
} = {}) {
  const data = useData();
  const [tab, setTab] = useState<Tab>('feed');
  const [stack, setStack] = useState<Route[]>(initialStack);
  const [signedIn, setSignedIn] = useState(false);
  /**
   * 011/FR-013. Why the app is showing sign-in, when it has a reason worth
   * saying. Empty on an ordinary signed-out launch.
   */
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    /**
     * 011/FR-013. ASKS WHETHER THE CREDENTIAL WORKS, not whether one is stored.
     *
     * This used to call `isSignedIn`, which answers "is there a token in the
     * store". A credential that has expired, been revoked by a password reset,
     * or belongs to a backend the app no longer points at passes that check —
     * and then every screen 401s and the person sees an empty product with no
     * explanation. "The feed is empty" and "you are signed out" look identical,
     * and only one of them is something they can act on.
     *
     * `resume` clears a rejected credential before returning, so the next launch
     * is an ordinary signed-out one rather than a repeat of this.
     */
    void data.session
      .resume()
      .then((result) => {
        if (!live) return;
        setSignedIn(result !== null && result !== 'rejected');
        if (result === 'rejected') {
          setSessionNotice('You were signed out. Sign in again to continue.');
        }
      })
      .catch(() => {
        /**
         * A NETWORK FAILURE IS NOT A REJECTION, and `resume` rethrows it rather
         * than discarding the credential. The app opens signed-out for this
         * launch and says nothing about the account, because it does not know
         * anything about the account — the backend did not answer.
         *
         * Signing somebody out for being in a tunnel, and throwing away their
         * credential to do it, is the failure mode this branch exists to avoid.
         */
        if (live) setSignedIn(false);
      });
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
              // 011/FR-013. Says WHY, when there is a why. Cleared as soon as it
              // is shown: a notice that outlives its cause reappears on a later
              // visit and describes something that is no longer true.
              {...(sessionNotice ? { notice: sessionNotice } : {})}
              onNoticeShown={() => setSessionNotice(null)}
              {...(backend
                ? {
                    address: backend.address,
                    onAddressChange: backend.onChange,
                    // A build given a real address opens as "sign in", not as
                    // "configure a client". The field is hidden, not removed.
                    addressFixed: ADDRESS_IS_COMPILED_IN,
                  }
                : {})}
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
              // 007/FR-017, gate G2.
              onOpenInterest={(interestId) => push({ name: 'interest', interestId })}
              onShare={(shareId) => push({ name: 'share', postId: shareId })}
              onEdit={(editId) => push({ name: 'edit-post', postId: editId })}
            />
          );
        case 'comments':
          return signedIn ? (
            <CommentsContainer
              postId={top.postId}
              // 008/FR-030.
              onOpenPerson={(personHandle) => push({ name: 'person', handle: personHandle })}
            />
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
          return (
            <EditProfileContainer
              onDone={pop}
              onOpenModerationNotices={() => push({ name: 'moderation-notices' })}
            />
          );
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
        /**
         * 008/FR-046, FR-047. Reached from Edit profile, beside the other
         * account-level things, because that is where somebody goes looking for
         * what has happened TO THEIR ACCOUNT — and because a route to a human
         * that takes three taps to find is a route most people do not take.
         */
        case 'moderation-notices':
          return signedIn ? (
            <ModerationNoticesContainer />
          ) : (
            <SignedOutNotice onSignIn={() => push({ name: 'sign-in' })} />
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
        /**
         * A downstream fork's own screen. There are none upstream.
         *
         * An UNKNOWN key renders a visible notice rather than nothing. A blank
         * body is the failure this codebase keeps finding — a tab with no feed
         * behind it, a screen nothing mounts — and it looks identical to a
         * screen that rendered and had nothing to say. This one names the key
         * that is missing.
         */
        case 'overlay': {
          const overlay = OVERLAY_SCREENS[top.screen];
          if (!overlay) {
            return (
              <View testID="overlay-screen-missing" style={{ padding: space.md }}>
                <Text style={{ ...textStyle.body, color: palette.intent.danger }}>
                  No overlay screen is registered for “{top.screen}”.
                </Text>
              </View>
            );
          }
          return overlay.render({
            params: top.params ?? {},
            push,
            pop,
            requireSignIn,
            signedIn,
          });
        }
      }
    })();

    return (
      <View testID="app-root" style={appRootStyle}>
        <Header title={headerTitle(top)} onBack={pop} />
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
                  // 007/FR-017. Tapping the coloured word opens its space, which
                  // is what keeps the taxonomy load-bearing once the feed stops
                  // being built from it — Principle I, and gate G2.
                  onOpenInterest={(interestId) => push({ name: 'interest', interestId })}
                />
              </View>
            );
          case 'discover':
            return (
              <DiscoverContainer
                onSelect={(interestId) => push({ name: 'interest', interestId })}
                onSelectPlace={(placeId) => push({ name: 'place', placeId })}
                onSelectPerson={(handle) => push({ name: 'person', handle })}
                // 008/US6. The Posts tab in Discover — an ADDITIONAL search
                // surface beside the interest one, never a replacement for it.
                onOpenPost={(postId) => push({ name: 'post', postId })}
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
            /**
             * 007/T051. Edit profile and Saved were two loose Buttons in a Row
             * BELOW the profile - a strip of chrome the artboard does not have,
             * bolted on here because the screen had nowhere to put them.
             * `Profile.dc.html` puts Edit profile under the bio and Saved in a
             * tab strip, so they are passed INTO the screen now. Both testIDs
             * are unchanged; 004/FR-038 still holds - Saved is reachable as
             * "mine" and nowhere else, and this is still the only route to it.
             */
            return signedIn ? (
              <ProfileContainer
                handle="me"
                isSelf
                onOpenPost={(postId) => push({ name: 'post', postId })}
                onEditProfile={() => push({ name: 'edit-profile' })}
                onOpenSaved={() => push({ name: 'saved' })}
              />
            ) : (
              <SignedOutNotice onSignIn={() => push({ name: 'sign-in' })} />
            );
          default: {
            const unreachable: never = tab;
            return unreachable;
          }
        }
      })()}

      {/*
        THE TAB BAR, per `design/007-ui/Main.dc.html`.

        Five slots, and compose is the CENTRE one — a filled accent square
        rather than a labelled button in a row above the bar, which is what 006
        had. That change is the design's, and it is also the reason the bar
        reads as five things instead of seven: "New post" and "Sign in" used to
        sit in their own row above it, so the bottom of every screen carried two
        strips of chrome.

        `tab-*` testIDs and `open-compose` and `open-sign-in` are unchanged.
        The preservation contract is about the id and what it marks (006/FR-027,
        SC-011), and each still marks the same control — nineteen Maestro flows
        and every browser journey depend on it.
      */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          backgroundColor: palette.bg.raised,
          borderTopWidth: 1,
          borderTopColor: palette.line.hairline,
          paddingTop: space.sm,
          paddingBottom: space.sm,
        }}
      >
        {TABS.slice(0, 2).map((t) => (
          <TabButton key={t.key} tab={t} active={tab === t.key} onPress={() => setTab(t.key)} />
        ))}

        <View style={{ flexGrow: 1, alignItems: 'center' }}>
          <Pressable
            testID="open-compose"
            accessibilityRole="button"
            accessibilityLabel="New post"
            onPress={() => requireSignIn({ name: 'compose' })}
            style={{
              width: 46,
              height: 34,
              borderRadius: radius.button,
              backgroundColor: palette.intent.accent,
              alignItems: 'center',
              justifyContent: 'center',
              // The art is 46x34; the TARGET is 44 tall, because a control
              // people press twenty times a day is not a place to save 10pt
              // (006/FR-020). Padding does not have to be visible to be real.
              marginVertical: (MIN_TOUCH_TARGET - 34) / 2,
            }}
            hitSlop={{ top: 5, bottom: 5, left: 8, right: 8 }}
          >
            <Text style={{ color: palette.text.onAccent, fontSize: 22, lineHeight: 24 }}>+</Text>
          </Pressable>
        </View>

        {TABS.slice(2).map((t) => (
          <TabButton key={t.key} tab={t} active={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </View>

      {signedIn ? null : (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          <Button
            testID="open-sign-in"
            label="Sign in"
            variant="secondary"
            onPress={() => push({ name: 'sign-in' })}
          />
        </View>
      )}
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
  /**
   * 009/US1. The address is no longer a constant compiled into the build.
   *
   * THE ADDRESS IS PASSED AS A GETTER, not as a value. `ApiClient` reads
   * `baseUrl` when it builds each request, so a getter means a change takes
   * effect on the very next call with nothing rebuilt. Passing the string
   * instead would replace `AppData` on every change, and the sign-in that
   * follows an address change would run against the object it just replaced.
   *
   * `addressRef` exists for that getter alone: `useCallback` with no deps keeps
   * one stable function so `DataProvider`'s memo never re-runs, while the ref
   * carries the current value. The state copy beside it is what RENDERS.
   *
   * Every hook is above every return, per `hooks-before-return.test.ts`.
   */
  const stores = useMemo(() => createStores(API_BASE_URL), []);
  const addressRef = useRef(API_BASE_URL);
  // Synchronous where the backing store allows it (localStorage, and no store at
  // all); null only where a real await is unavoidable, which is a device.
  const [address, setAddress] = useState<string | null>(
    () => stores.settings?.peekBaseUrl() ?? (stores.settings ? null : API_BASE_URL),
  );
  const getBaseUrl = useCallback(() => addressRef.current, []);

  useEffect(() => {
    let live = true;
    const load = async () => {
      const stored = (await stores.settings?.getBaseUrl()) ?? API_BASE_URL;
      addressRef.current = stored;
      if (live) setAddress(stored);
    };
    void load();
    return () => {
      live = false;
    };
  }, [stores]);

  const changeAddress = useCallback(
    async (next: string) => {
      // The store decides whether this is a change, and clears the credential
      // if it is. Reading back what it stored means the normalised value is
      // what renders, so the field cannot disagree with what requests use.
      await stores.settings?.setBaseUrl(next);
      const applied = (await stores.settings?.getBaseUrl()) ?? next;
      addressRef.current = applied;
      setAddress(applied);
    },
    [stores],
  );

  // Nothing is rendered until the stored address is known. Rendering the
  // built-in default first would fire the feed's opening requests at the wrong
  // backend and show a person an error about a server they never chose.
  if (address === null) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg.base }} />;
  }

  return (
    <DataProvider baseUrl={getBaseUrl} tokens={stores.tokens}>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg.base }}>
        <StatusBar />
        <Shell backend={{ address, onChange: changeAddress }} />
      </SafeAreaView>
    </DataProvider>
  );
}
