/**
 * InterestContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { PostCard } from '../components/PostCard';
import { usePaged } from '../containers';
import { useData } from '../data-provider';
import { DataError } from '../data';
import { InterestScreen, type InterestScreenData } from '../features/discover/InterestScreen';
import { useInterestPosts } from '../containers';
import { Failed } from './shared';

export function InterestContainer({
  interestId,
  onOpenSubInterest,
  onOpenPost,
  onReportDescription,
}: {
  interestId: string;
  onOpenSubInterest: (id: string) => void;
  onOpenPost: (postId: string) => void;
  /** 004/FR-030. A description is content, so it is reportable. */
  onReportDescription?: (interestId: string) => void;
}) {
  const data = useData();
  const [detail, setDetail] = useState<InterestScreenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followedCount, setFollowedCount] = useState(0);
  // 004/FR-027, FR-029. Debounced by usePaged's dependency change, which
  // restarts paging - see useInterestPosts.
  const [order, setOrder] = useState<'new' | 'top'>('new');
  const [query, setQuery] = useState('');
  const { state, loadMore } = useInterestPosts(interestId, { order, q: query });

  useEffect(() => {
    let live = true;
    Promise.all([
      data.interests.get(interestId),
      data.interests.listChildren(interestId),
      data.session.me().catch(() => null),
    ])
      .then(([interest, children, me]) => {
        if (!live) return;
        setDetail({ interest, subInterests: children.items, rollsUpFrom: [] });
        setFollowedCount(me?.interestFollowCount ?? 0);
      })
      .catch((e: unknown) => live && setError(e instanceof DataError ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [data, interestId]);

  const toggleFollow = useCallback(
    (next: boolean) => {
      // Optimistic, then reconciled by the refusal path: the server enforces the
      // 200-interest cap (FR-034), so a rejection has to put the control back
      // rather than leave it showing a follow that did not happen.
      setDetail((d) => (d ? { ...d, interest: { ...d.interest, viewerIsFollowing: next } } : d));
      setFollowedCount((c) => c + (next ? 1 : -1));
      const call = next ? data.interests.follow(interestId) : data.interests.unfollow(interestId);
      void call.catch((e: unknown) => {
        setDetail((d) => (d ? { ...d, interest: { ...d.interest, viewerIsFollowing: !next } } : d));
        setFollowedCount((c) => c + (next ? -1 : 1));
        setError(e instanceof DataError ? e.message : String(e));
      });
    },
    [data, interestId],
  );

  if (error) return <Failed message={error} />;
  if (!detail) return <View testID="interest-loading" />;
  return (
    <InterestScreen
      data={detail}
      posts={state}
      followedCount={followedCount}
      order={order}
      query={query}
      onLoadMore={loadMore}
      onToggleFollow={toggleFollow}
      onOpenSubInterest={onOpenSubInterest}
      onOrderChange={setOrder}
      onQueryChange={setQuery}
      {...(onReportDescription ? { onReportDescription: () => onReportDescription(interestId) } : {})}
      renderPost={(post) => (
        <PostCard post={post} onOpen={onOpenPost} />
      )}
    />
  );
}
