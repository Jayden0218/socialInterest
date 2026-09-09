import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { Post } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle, MIN_TOUCH_TARGET } from '../../ui/theme';
import { Banner, Button, Screen, ScreenHeader } from '../../ui/primitives';
import { PagedPostList, type PagedState } from '../../components/PagedPostList';

/** 008/FR-049. */
export interface SavedCollection {
  collectionId: string;
  name: string;
  itemCount: number;
}

/**
 * 008/FR-051, ON THE SCREEN — "All" IS NOT A COLLECTION.
 *
 * The shelves are a FILTER over one list, not a set of boxes the posts move
 * between. Making "All" the first option and the default is how the screen says
 * that: a person who files a post and then taps All still sees it, which is
 * exactly what FR-051 guarantees on the server. A screen that replaced the saved
 * list with a list of collections would describe a product this one is not.
 */
export const ALL_SAVED = 'all';

/**
 * FR-038, FR-039. Your saved posts, and nobody else's.
 *
 * The empty state says "nothing saved yet" rather than "nothing to show",
 * because a saved list is empty for a reason the person controls - unlike a
 * feed, which is empty because of what other people have or have not done.
 */
export function SavedScreen({
  posts,
  onLoadMore,
  renderPost,
  collections,
  selected,
  onSelect,
  newCollectionName,
  onNewCollectionNameChange,
  onCreateCollection,
  creating,
  error,
}: {
  posts: PagedState<Post>;
  onLoadMore: () => void;
  renderPost: (post: Post) => React.ReactElement;
  /** 008/FR-049. Absent renders exactly the pre-008 screen. */
  collections?: SavedCollection[];
  selected?: string;
  onSelect?: (collectionId: string) => void;
  newCollectionName?: string;
  onNewCollectionNameChange?: (next: string) => void;
  onCreateCollection?: () => void;
  creating?: boolean;
  error?: string | null;
}) {
  return (
    <Screen testID="saved-screen" padded={false}>
      {/*
        `Saved.dc.html` puts "only you" beside the title. That is not decoration:
        FR-039 is that a saved list is yours and nobody else's, and a person
        deciding whether to save something they would not post is deciding on
        exactly that. A guarantee the product makes and never states is one
        nobody can rely on.
      */}
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <ScreenHeader
          title="Saved"
          right={
            <Text style={{ ...textStyle.label, fontWeight: '400', color: palette.text.muted }}>
              only you
            </Text>
          }
        />
      </View>
      {collections && onSelect ? (
        <View style={{ gap: space.sm, paddingTop: space.sm }}>
          {/*
            A ROW THAT SCROLLS SIDEWAYS, for the reason compose's media strip
            does after run 52: a wrapping row of shelves is unbounded in the one
            direction a screen cannot afford, and the posts below are the point
            of the screen.
          */}
          <ScrollView
            testID="collection-filter"
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg }}
          >
            {[{ collectionId: ALL_SAVED, name: 'All', itemCount: 0 }, ...collections].map((c) => {
              const active = (selected ?? ALL_SAVED) === c.collectionId;
              return (
                <Pressable
                  key={c.collectionId}
                  testID={`collection-tab-${c.collectionId}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={c.name}
                  onPress={() => onSelect(c.collectionId)}
                  style={{
                    minHeight: MIN_TOUCH_TARGET,
                    justifyContent: 'center',
                    paddingHorizontal: space.md,
                    borderRadius: radius.pill,
                    backgroundColor: active ? palette.intent.accent : palette.bg.sunken,
                  }}
                >
                  <Text
                    style={{
                      ...textStyle.label,
                      color: active ? palette.text.onAccent : palette.text.primary,
                    }}
                  >
                    {c.collectionId === ALL_SAVED ? c.name : `${c.name} · ${c.itemCount}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {onCreateCollection && onNewCollectionNameChange ? (
            <View style={{ flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg }}>
              <TextInput
                testID="new-collection-name"
                accessibilityLabel="New collection name"
                placeholder="New collection"
                placeholderTextColor={palette.text.muted}
                value={newCollectionName ?? ''}
                onChangeText={onNewCollectionNameChange}
                maxLength={60}
                style={{
                  flex: 1,
                  minHeight: MIN_TOUCH_TARGET,
                  borderWidth: 1,
                  borderColor: palette.line.hairline,
                  borderRadius: radius.field,
                  paddingHorizontal: space.md,
                  color: palette.text.primary,
                  ...textStyle.body,
                }}
              />
              <Button
                testID="create-collection"
                label={creating ? 'Adding…' : 'Add'}
                variant="secondary"
                disabled={creating === true || (newCollectionName ?? '').trim().length === 0}
                onPress={onCreateCollection}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {error ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
          <Banner tone="danger" testID="collections-error">{error}</Banner>
        </View>
      ) : null}

      <PagedPostList
        state={posts}
        keyOf={(p: Post) => p.postId}
        renderItem={renderPost}
        onLoadMore={onLoadMore}
        /**
         * 008/T224 — THE EMPTY STATE HAS TO KNOW WHICH LIST IS EMPTY.
         *
         * "Nothing saved yet. Tap the star." is true of the whole list and
         * WRONG of an empty shelf: those posts are saved, they are just not
         * filed here, and telling somebody to save them again describes a
         * product where a collection is a box. FR-051 says it is a shelf, and
         * the copy has to say the same thing or the screen argues with the
         * server.
         */
        empty={
          (selected ?? ALL_SAVED) === ALL_SAVED
            ? { title: 'Nothing saved yet', body: 'Tap the star on a post to keep it here.' }
            : {
                title: 'Nothing filed here yet',
                body: 'Open a saved post and add it to this collection. It stays in All either way.',
              }
        }
      />
    </Screen>
  );
}
