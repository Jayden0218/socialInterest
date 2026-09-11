/**
 * SavedContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { PostCard } from '../components/PostCard';
import { SavedScreen, ALL_SAVED } from '../features/profile/SavedScreen';
import { usePaged } from '../containers';
import { useData } from '../data-provider';
import { DataError, type Collection } from '../data';
import { Failed } from './shared';

/** FR-038, FR-039. Surface 9 in the app. */
export function SavedContainer({ onOpenPost }: { onOpenPost: (postId: string) => void }) {
  const data = useData();
  // 008/FR-049. `all` is not a collection — see the note on `ALL_SAVED`.
  const [selected, setSelected] = useState<string>(ALL_SAVED);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  /**
   * The SELECTED shelf is part of the paging identity, so switching shelves
   * starts a new list rather than appending to the old one. `usePaged`'s deps
   * array is what makes that true; leaving `selected` out of it is how a filter
   * ends up showing two collections at once.
   */
  const { state, error, loadMore } = usePaged(
    (cursor) =>
      selected === ALL_SAVED
        ? data.saved.list(cursor ? { cursor } : {})
        : data.saved.collectionPosts(selected, cursor ? { cursor } : {}),
    [selected],
  );

  const loadCollections = useCallback(async () => {
    setCollections((await data.saved.collections({ limit: 50 })).items);
  }, [data]);

  useEffect(() => {
    let live = true;
    void loadCollections().catch((e: unknown) => {
      // A failed collection list must never stop the saved list rendering: the
      // shelves are a filter over it, not the thing itself.
      if (live) setCollectionsError(e instanceof DataError ? e.message : String(e));
    });
    return () => {
      live = false;
    };
  }, [loadCollections]);

  const createCollection = useCallback(async () => {
    setCreating(true);
    try {
      await data.saved.createCollection(newName.trim());
      setNewName('');
      await loadCollections();
    } catch (e: unknown) {
      setCollectionsError(e instanceof DataError ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }, [data, newName, loadCollections]);

  if (error) return <Failed message={error} />;
  return (
    <SavedScreen
      posts={state}
      onLoadMore={loadMore}
      renderPost={(post) => (
        <PostCard post={post} onOpen={onOpenPost} />
      )}
      collections={collections.map((c) => ({
        collectionId: c.collectionId,
        name: c.name,
        itemCount: c.itemCount,
      }))}
      selected={selected}
      onSelect={setSelected}
      newCollectionName={newName}
      onNewCollectionNameChange={setNewName}
      onCreateCollection={() => void createCollection()}
      creating={creating}
      error={collectionsError}
    />
  );
}
