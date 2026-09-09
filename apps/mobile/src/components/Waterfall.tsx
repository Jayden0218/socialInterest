import { Fragment, useCallback, useMemo, useRef } from 'react';
import { FlatList, Text, View } from 'react-native';
import type { Post } from '@sih/shared';
import { useTheme } from '../ui/useTheme';
import { space, type as typeScale } from '../ui/tokens';
import { EmptyState } from '../ui/primitives';
import { Skeleton } from './Skeleton';
import { shouldLoadMore, type PagedState } from './PagedPostList';

/** Research R6. Columns flow independently inside a block; blocks virtualise. */
export const BLOCK_SIZE = 8;
export const COLUMNS = 2;
/** Used when the contract carries no dimensions, matching PostCard. */
const FALLBACK_RATIO = 4 / 3;
/** Rough height of a card's text block, in units of column width. */
const TEXT_BLOCK_RATIO = 0.42;

export interface Block {
  key: string;
  columns: Post[][];
}

/**
 * THE LAYOUT DECISION, as a pure function, so it can be tested without a
 * renderer and without a viewport.
 *
 * Each card goes to the SHORTER column by accumulated height, where a card's
 * height is its media's aspect ratio plus a constant for the text beneath. That
 * is the whole algorithm, and it is what makes the columns stagger — the thing
 * that distinguishes a waterfall from a two-column grid, in which every row is
 * bottom-synced and every photograph is cropped to the same rectangle.
 */
export function layOutBlock(posts: Post[], columns = COLUMNS): Post[][] {
  const cols: Post[][] = Array.from({ length: columns }, () => []);
  const heights = new Array<number>(columns).fill(0);

  for (const post of posts) {
    const media = post.media?.[0];
    const ratio = media?.width && media.height ? media.width / media.height : FALLBACK_RATIO;
    // Height per unit width: taller image = smaller ratio = taller card.
    const height = (media ? 1 / ratio : 0) + TEXT_BLOCK_RATIO;

    let shortest = 0;
    for (let i = 1; i < columns; i++) if (heights[i]! < heights[shortest]!) shortest = i;
    cols[shortest]!.push(post);
    heights[shortest] = heights[shortest]! + height;
  }

  return cols;
}

/** Chunk into blocks, each laid out independently. */
export function toBlocks(posts: Post[], blockSize = BLOCK_SIZE): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < posts.length; i += blockSize) {
    const slice = posts.slice(i, i + blockSize);
    blocks.push({ key: slice[0]?.postId ?? `block-${i}`, columns: layOutBlock(slice) });
  }
  return blocks;
}

/**
 * 007/FR-021 — THE TWO-COLUMN WATERFALL.
 *
 * Research R6, and the shape is forced rather than chosen. React Native has no
 * native masonry list, and the two obvious approaches each break something:
 *
 * - `FlatList numColumns={2}` renders ROWS, so the two cells in a row are
 *   bottom-synced. That is a ragged grid, not a waterfall, and it is visibly not
 *   the approved design.
 * - Two `FlatList`s inside a `ScrollView` flows the columns independently and
 *   NESTS VirtualizedLists, which disables windowing — an infinite feed then
 *   holds every card mounted.
 *
 * Chunking gets both: columns flow independently inside a block of 8, and ONE
 * `FlatList` virtualises the blocks. The cost is that the columns re-sync every
 * eight cards; on a screen showing four or five posts, that boundary is below
 * the fold more often than not. Whether it is visible on a device is an open
 * question `MasonryFlashList` answers, and that is a native module this project
 * has been bitten by before.
 */
export function Waterfall({
  state,
  renderPost,
  onLoadMore,
  onViewableChanged,
  empty,
}: {
  state: PagedState<Post>;
  renderPost: (post: Post, index: number) => React.ReactElement;
  onLoadMore: () => void;
  /** 007/FR-004. Absent on lists that are not the feed. */
  onViewableChanged?: (postIds: string[]) => void;
  empty?: { title: string; body: string; actionLabel?: string; onAction?: () => void };
}) {
  const palette = useTheme();
  const blocks = useMemo(() => toBlocks(state.items), [state.items]);

  /**
   * A STABLE CALLBACK, held through a ref.
   *
   * `FlatList` THROWS on a changed `onViewableItemsChanged` — an inline arrow is
   * a new identity every render, and the feed crashed on its SECOND render when
   * dwell measurement was first wired. The config object carries the same rule
   * and is a module constant below. Guarding one and not the other is what
   * happened the first time.
   */
  const latest = useRef(onViewableChanged);
  latest.current = onViewableChanged;
  const handleViewable = useCallback(
    ({ viewableItems }: { viewableItems: { item: Block }[] }) =>
      latest.current?.(
        viewableItems.flatMap((v) => v.item.columns.flat().map((p) => p.postId)),
      ),
    [],
  );

  if (state.items.length === 0 && !state.loading) {
    return (
      <EmptyState
        testID="paged-empty"
        title={empty?.title ?? 'Nothing here yet'}
        body={empty?.body ?? 'There is nothing to show.'}
        {...(empty?.actionLabel ? { actionLabel: empty.actionLabel } : {})}
        {...(empty?.onAction ? { onAction: empty.onAction } : {})}
      />
    );
  }

  return (
    <FlatList
      testID="paged-post-list"
      data={blocks}
      keyExtractor={(b) => b.key}
      renderItem={({ item: block, index: blockIndex }) => (
        <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
          {block.columns.map((column, columnIndex) => (
            <View
              key={columnIndex}
              testID={`waterfall-column-${columnIndex}`}
              // `flex: 1` rather than a fixed 178pt: the design is drawn at
              // 390pt wide and the app runs on everything from 320 up.
              style={{ flex: 1, gap: space.md }}
            >
              {/*
                A KEYED FRAGMENT, not a wrapper View: the column's `gap` counts
                its children, so adding a layout node here would change the
                spacing the design specifies. React reconciles a keyless list by
                position, which for an append-only page is usually harmless and
                is wrong the moment two posts swap - and the warning it prints
                was reaching every render of this list, feed included. Found
                when the post-search surface first rendered through it.
              */}
              {column.map((post, i) => (
                <Fragment key={post.postId}>
                  {renderPost(post, blockIndex * BLOCK_SIZE + columnIndex * BLOCK_SIZE + i)}
                </Fragment>
              ))}
            </View>
          ))}
        </View>
      )}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (shouldLoadMore(state)) onLoadMore();
      }}
      {...(onViewableChanged
        ? { viewabilityConfig: VIEWABILITY_CONFIG, onViewableItemsChanged: handleViewable }
        : {})}
      contentContainerStyle={{ paddingHorizontal: space.md }}
      ListFooterComponent={
        state.loading ? (
          /**
           * 006/FR-023. A SKELETON IN THE SHAPE OF WHAT IS COMING, not a
           * spinner — two column-shaped placeholders that hold roughly the space
           * the next cards will need, so the scroll does not lurch when they
           * land. `paged-loading` keeps its testID and its meaning.
           */
          <View testID="paged-loading" style={{ flexDirection: 'row', gap: space.sm, paddingBottom: space.md }}>
            <Skeleton style={{ flex: 1, height: 200 }} />
            <Skeleton style={{ flex: 1, height: 150 }} />
          </View>
        ) : state.exhausted && state.items.length > 0 ? (
          <Text
            testID="paged-end"
            style={{
              textAlign: 'center',
              color: palette.text.muted,
              fontSize: typeScale.small.size,
              lineHeight: typeScale.small.lineHeight,
              paddingBottom: space.lg,
            }}
          >
            You're all caught up
          </Text>
        ) : null
      }
    />
  );
}

/** Stable, because RN refuses a viewabilityConfig that changes identity. */
const VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 60,
  minimumViewTime: 300,
} as const;
