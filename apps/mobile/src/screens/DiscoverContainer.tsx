/**
 * DiscoverContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useEffect, useState } from 'react';
import { InterestSearchScreen, type SearchMode } from '../features/discover/InterestSearchScreen';
import { PostSearchResults } from '../features/discover/PostSearchResults';
import type { PublicProfile, PlaceSummary } from '@sih/shared';
import { useInterestSearch, usePostSearch } from '../containers';
import { useData } from '../data-provider';
import type { InterestRef } from '@sih/shared';
import { Failed } from './shared';

export function DiscoverContainer({
  onSelect,
  onSelectPlace,
  onSelectPerson,
  onOpenPost,
}: {
  onSelect: (interestId: string) => void;
  /** 004/US2. Places live inside Discover rather than taking a sixth tab. */
  onSelectPlace?: (placeId: string) => void;
  /** 004/FR-034. So do people. */
  onSelectPerson?: (handle: string) => void;
  /** 008/US6. Absent means the Posts tab is not offered at all. */
  onOpenPost?: (postId: string) => void;
}) {
  const data = useData();
  const [query, setQuery] = useState('');
  const [locality, setLocality] = useState('');
  const [places, setPlaces] = useState<PlaceSummary[]>([]);
  const [people, setPeople] = useState<PublicProfile[]>([]);
  const [mode, setMode] = useState<SearchMode>('interests');
  const [postMeta, setPostMeta] = useState<{
    terms: string[];
    fallback: { interests: InterestRef[]; people: PublicProfile[] } | null;
  }>({ terms: [], fallback: null });
  const { state, error } = useInterestSearch(query);
  const postSearch = usePostSearch(query, mode === 'posts' && onOpenPost !== undefined, (page) =>
    setPostMeta({ terms: page.meta?.terms ?? [], fallback: page.fallback ?? null }),
  );

  useEffect(() => {
    if (!onSelectPerson || query.trim().length === 0) {
      setPeople([]);
      return;
    }
    let live = true;
    // Swallowed on failure, like the place lookup: neither may take the
    // interest search - the product's primary navigation - down with it.
    void data.people
      .search(query, { limit: 5 })
      .then((r) => live && setPeople(r.items))
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [data, query, onSelectPerson]);

  useEffect(() => {
    if (!onSelectPlace || query.trim().length === 0 || locality.trim().length === 0) {
      setPlaces([]);
      return;
    }
    let live = true;
    // Swallowed on failure: a place lookup that is down must not take the
    // interest search - the product's primary navigation - down with it.
    void data.places
      .search(query, { locality, limit: 5 })
      .then((r) => live && setPlaces(r.items))
      .catch(() => live && setPlaces([]));
    return () => {
      live = false;
    };
  }, [data, query, locality, onSelectPlace]);

  if (error) return <Failed message={error} />;
  return (
    <InterestSearchScreen
      query={query}
      results={state.items}
      places={places}
      people={people}
      locality={locality}
      mode={mode}
      onQueryChange={setQuery}
      {...(onSelectPlace ? { onLocalityChange: setLocality, onSelectPlace } : {})}
      {...(onSelectPerson ? { onSelectPerson } : {})}
      {...(onOpenPost
        ? {
            onSelectMode: setMode,
            posts: (
              <PostSearchResults
                query={query}
                state={postSearch.state}
                terms={postMeta.terms}
                fallback={postMeta.fallback}
                onLoadMore={postSearch.loadMore}
                onOpenPost={onOpenPost}
                onOpenInterest={onSelect}
                {...(onSelectPerson ? { onOpenPerson: onSelectPerson } : {})}
              />
            ),
          }
        : {})}
      onSelect={onSelect}
    />
  );
}
