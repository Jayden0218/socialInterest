/**
 * HomeFeedContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useState } from 'react';
import { HomeFeedScreen } from '../features/feed/HomeFeedScreen';
import { PostCard } from '../components/PostCard';
import { useFollowingFeed, useHomeFeed } from '../containers';
import { useDwell } from '../features/feed/useDwell';
import { space } from '../ui/theme';
import { useData } from '../data-provider';
import { Failed } from './shared';

export function HomeFeedContainer({
  onEmptyAction,
  onOpenPost,
  onOpenInterest,
}: {
  onEmptyAction: () => void;
  onOpenPost: (postId: string) => void;
  /** 007/FR-017. One tap from a card to the interest's space. */
  onOpenInterest?: (interestId: string) => void;
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
  if (active.error) return <Failed message={active.error} />;
  return (
    <HomeFeedScreen
      state={active.state}
      onLoadMore={active.loadMore}
      onEmptyAction={onEmptyAction}
      tab={tab}
      onSelectTab={setTab}
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
    />
  );
}
