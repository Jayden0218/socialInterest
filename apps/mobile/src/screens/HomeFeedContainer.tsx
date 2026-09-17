/**
 * HomeFeedContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useEffect, useState } from 'react';
import { HomeFeedScreen } from '../features/feed/HomeFeedScreen';
import { PostCard } from '../components/PostCard';
import { useFollowingFeed, useHomeFeed } from '../containers';
import { useDwell } from '../features/feed/useDwell';
import { space } from '../ui/theme';
import { useData } from '../data-provider';
import { surfaceFallback } from '../ui/SurfaceStates';

export function HomeFeedContainer({
  onEmptyAction,
  onCompose,
  onOpenPost,
  onOpenInterest,
  onOpenSearch,
}: {
  onEmptyAction: () => void;
  /**
   * 012/FR-020, FR-021. Where "publish the first one" goes.
   *
   * Optional, so the screen keeps working without it — but see `emptyAction`
   * below for why an install with nothing in it has no other honest offer.
   */
  onCompose?: () => void;
  onOpenPost: (postId: string) => void;
  /** 007/FR-017. One tap from a card to the interest's space. */
  onOpenInterest?: (interestId: string) => void;
  /** The header magnifier (012/Main.dc.html). */
  onOpenSearch?: () => void;
}) {
  const data = useData();
  /**
   * 007/FR-004. Declared BEFORE the early return below, because a hook after
   * any return is the "Rendered more hooks than during the previous render"
   * crash - guarded by `hooks-before-return.test.ts`, which exists because this
   * exact mistake has been made here before.
   */
  const dwell = useDwell(data.signals);
  const [tab, setTab] = useState<'for-you' | 'following'>('for-you');
  const ranked = useHomeFeed();
  const following = useFollowingFeed();
  const active = tab === 'for-you' ? ranked : following;

  /**
   * 012/T018. THE FEED IS THE FIRST SCREEN A SIGNED-IN PERSON SEES, AND IT HAD
   * NO LOADING STATE AT ALL.
   *
   * It rendered nothing while it fetched, so "working", "there is nothing" and
   * "that failed" were one blank rectangle on the product's front door. The
   * `Failed` early return that used to be here handled one of the four; the
   * other three were the same blank screen.
   *
   * The states wrap the screen rather than living inside it, so the feed cannot
   * render a blank rectangle by accident — and the decision about WHICH state
   * is `usePaged`'s, made once, rather than this screen's opinion.
   */
  /**
   * 012/T018. THE FEED IS THE FIRST SCREEN A SIGNED-IN PERSON SEES, AND IT HAD
   * NO LOADING STATE AT ALL.
   *
   * It rendered nothing while it fetched, so "working", "there is nothing" and
   * "that failed" were one blank rectangle on the product's front door. The
   * `Failed` early return that used to be here covered one of the four; the
   * other three were the same blank screen.
   *
   * A FALLBACK, NOT A WRAPPER — the screen keeps its header and its For You /
   * Following switcher in every state. Wrapping was the first attempt and it
   * left an empty feed with no control to change that it was empty.
   */
  /**
   * 012/T042-T044, FR-020, FR-021. IS THERE ANYTHING TO EXPLORE AT ALL?
   *
   * The empty state used to offer "Explore interests" unconditionally. FR-020
   * asks for "a next action AVAILABLE TO THAT PERSON" and FR-021 for one that
   * "visibly changes the feed" — and on a brand-new install BOTH fail: since 013
   * the product ships with no interests of its own, so Explore is empty too, and
   * the one control on an empty room opens another empty room.
   *
   * T044 asked for this to be DECIDED and recorded rather than guessed, and
   * ruled out the obvious shortcut in advance: "`seed:demo` is a development
   * tool and borrowing it would be answering a product question with a script."
   * So the decision is not to give a newcomer content. It is to stop offering
   * them somebody else's:
   *
   *   - something to explore  -> "Explore interests", as before
   *   - nothing at all yet    -> "Share your first photo"
   *
   * The second is the only action that is genuinely available on an empty
   * install and the only one that visibly changes the feed, because a person's
   * own post is in it. That is also what the product IS: research R4 is blunt
   * that "♥ 0 · 0 everywhere" is what an install with no real use looks like and
   * that no state, skeleton or palette fixes it.
   *
   * ONE REQUEST, and its failure is swallowed. A catalogue lookup that is down
   * must not decide the empty state wrongly in the alarming direction, so the
   * default is the old copy.
   */
  const [catalogueHasAnything, setCatalogueHasAnything] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void data.interests
      .listTop({ limit: 1 })
      .then((page) => live && setCatalogueHasAnything(page.items.length > 0))
      .catch(() => live && setCatalogueHasAnything(null));
    return () => {
      live = false;
    };
  }, [data]);
  const nothingToExploreYet = catalogueHasAnything === false && onCompose !== undefined;

  const fallback = surfaceFallback(active, {
    shape: 'feed',
    ids: { loading: 'feed-loading', empty: 'feed-empty', failed: 'feed-failed' },
    empty: {
      icon: nothingToExploreYet ? 'camera' : 'explore',
      title: 'Nothing here yet',
      /**
       * FR-007: names an action and offers the control that performs it.
       *
       * FR-011 is why it says nothing about WHY the feed is short. A feed can be
       * empty because a person follows little, and it can be empty because the
       * boundary withheld everything — Constitution II makes those deliberately
       * indistinguishable, so an empty state that explained the difference
       * would be an oracle.
       */
      body: nothingToExploreYet
        ? 'Nobody has posted here yet. Put something up and it will be the first thing in it.'
        : 'Follow a few interests and your feed fills up.',
      actionLabel: nothingToExploreYet ? 'Share your first photo' : 'Explore interests',
      onAction: nothingToExploreYet ? (onCompose ?? onEmptyAction) : onEmptyAction,
    },
  });

  return (
    <HomeFeedScreen
      state={active.state}
      onLoadMore={active.loadMore}
      onEmptyAction={onEmptyAction}
      tab={tab}
      onSelectTab={setTab}
      {...(onOpenSearch ? { onOpenSearch } : {})}
      /**
       * 008/FR-009 — THE DWELL HOOK IS ATTACHED TO THE RANKED TAB ONLY.
       *
       * FR-009 is a CLIENT obligation as well as a server one. The server
       * records nothing on `GET /feed/following`, but dwell is measured on the
       * device and posted to `/v1/signals` separately - so leaving this wired
       * while Following was showing would train the ranked feed from the surface
       * a person chose in order to avoid it. The structural guard on the server
       * cannot see this; only this line and its journey can.
       */
      {...(tab === 'for-you' ? { onViewableChanged: dwell.onViewableChanged } : {})}
      renderPost={(post) => (
        <PostCard
          post={post}
          onOpenInterest={onOpenInterest}
          onOpen={(postId) => {
            /**
             * FR-010: this records that the post was opened. It does NOT show
             * the person why it was ranked where it was - no browse or post
             * surface may. The disclosure lives in Settings and nowhere else.
             *
             * 008/FR-009: not on the Following tab, for the reason above.
             */
            if (tab === 'for-you') dwell.record({ kind: 'open', postId });
            onOpenPost(postId);
          }}
        />
      )}
      refreshing={active.refreshing}
      onRefresh={active.refresh}
      {...(fallback ? { fallback } : {})}
    />
  );
}
