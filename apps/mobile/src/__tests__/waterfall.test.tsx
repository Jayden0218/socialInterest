import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Post } from '@sih/shared';
import { layOutBlock, toBlocks, BLOCK_SIZE } from '../components/Waterfall';

/**
 * 007/FR-021 — A WATERFALL IS NOT A GRID, and the difference is the whole point.
 *
 * `FlatList numColumns={2}` renders ROWS, so the two cells in a row are
 * bottom-synced: every photograph is cropped to the same rectangle and the
 * result is the design the owner rejected. The staggering is what lets media
 * keep its own shape, so it is asserted rather than looked at.
 *
 * The layout is a pure function precisely so this can be true without a
 * renderer, a viewport or a device — the parts of it that need those are the
 * parts a browser journey and the emulator answer.
 */
const post = (postId: string, width: number, height: number): Post =>
  ({
    postId,
    caption: postId,
    interests: [],
    media: [{ ordinal: 0, kind: 'image', width, height, processingState: 'ready', renditions: {} }],
    reactionCount: 0,
    commentCount: 0,
    processingState: 'ready',
    visibility: 'public',
    author: { userId: 'u', handle: 'h', displayName: 'H' },
  }) as unknown as Post;

describe('the waterfall layout', () => {
  it('sends each card to the SHORTER column, so the columns stagger', () => {
    // One very tall card, then four square ones. A grid would alternate
    // left/right regardless; a waterfall puts the next three on the right,
    // because the left column is still taller.
    const posts = [
      post('tall', 100, 400),
      post('a', 100, 100),
      post('b', 100, 100),
      post('c', 100, 100),
    ];
    const [left, right] = layOutBlock(posts);

    expect(left!.map((p) => p.postId)).toEqual(['tall']);
    expect(right!.map((p) => p.postId)).toEqual(['a', 'b', 'c']);
  });

  it('alternates when every card is the same shape, which is the grid case', () => {
    // The degenerate input. Equal heights mean the shorter column alternates,
    // and a waterfall of identical images IS a grid — that is correct, not a
    // failure, and stating it stops the test above being read as "always 1-3".
    const posts = ['a', 'b', 'c', 'd'].map((id) => post(id, 100, 100));
    const [left, right] = layOutBlock(posts);
    expect(left!.map((p) => p.postId)).toEqual(['a', 'c']);
    expect(right!.map((p) => p.postId)).toEqual(['b', 'd']);
  });

  it('keeps a post with no media in the flow rather than dropping it', () => {
    const noMedia = { ...post('text-only', 1, 1), media: [] } as unknown as Post;
    const columns = layOutBlock([noMedia, post('a', 100, 100)]);
    expect(columns.flat().map((p) => p.postId)).toEqual(['text-only', 'a']);
  });

  it('chunks into blocks of 8, and every post appears exactly once', () => {
    const posts = Array.from({ length: 19 }, (_, i) => post(`p${i}`, 100, 100 + i * 13));
    const blocks = toBlocks(posts);

    expect(blocks).toHaveLength(3);
    const seen = blocks.flatMap((b) => b.columns.flat().map((p) => p.postId));
    expect(seen).toHaveLength(19);
    expect(new Set(seen).size).toBe(19);
    expect(blocks[0]!.columns.flat()).toHaveLength(BLOCK_SIZE);
  });

  it('gives each block a stable key from its first post, not its index', () => {
    // An index key makes every block re-render when a page prepends, which is
    // the cheapest way to lose scroll position in an infinite feed.
    const blocks = toBlocks(Array.from({ length: 9 }, (_, i) => post(`p${i}`, 100, 100)));
    expect(blocks.map((b) => b.key)).toEqual(['p0', 'p8']);
  });
});

/**
 * The structural half, and it is the one research R6 turned on.
 *
 * Two `FlatList`s inside a `ScrollView` is the obvious way to get independent
 * columns and it NESTS VirtualizedLists, which disables windowing — an infinite
 * feed then holds every card mounted and the app dies on a long scroll. React
 * Native only warns, at runtime, in development. This fails the build.
 */
describe('no VirtualizedList is nested inside a ScrollView', () => {
  const SRC = join(__dirname, '..');
  const strip = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

  function filesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === '__tests__') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...filesUnder(full));
      else if (entry.endsWith('.tsx')) out.push(full);
    }
    return out;
  }

  it('no file renders a FlatList inside a ScrollView', () => {
    const offenders = filesUnder(SRC)
      .filter((file) => {
        const src = strip(readFileSync(file, 'utf8'));
        // A `ScrollView` opening before a `FlatList` in the same file, with no
        // closing tag between them. Crude on purpose: a precise version needs a
        // parser, and the crude one has no false negatives for the shape that
        // actually occurs — a list dropped into a scrolling screen.
        return /<ScrollView[\s\S]*?<FlatList/.test(src);
      })
      .map((f) => f.replace(`${SRC}/`, ''));

    expect(offenders).toEqual([]);
  });

  it('a screen that scrolls does not also hand its children a list', () => {
    // `Screen scroll` is a ScrollView (006), so the same rule applies to it.
    const offenders = filesUnder(SRC)
      .filter((file) => /<Screen[^>]*\bscroll\b[\s\S]*?<(FlatList|Waterfall|PagedPostList)/.test(strip(readFileSync(file, 'utf8'))))
      .map((f) => f.replace(`${SRC}/`, ''));

    expect(offenders).toEqual([]);
  });
});
