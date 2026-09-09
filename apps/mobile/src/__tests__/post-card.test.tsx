import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { Post } from '@sih/shared';
import { PostCard, PostTile, visibleMediaCount } from '../components/PostCard';
import { multiImagePost, partiallyFailedPost, singleImagePost } from './fixtures/post';

/**
 * 006/US1. THE FEED MUST SHOW WHAT WAS POSTED.
 *
 * Until this feature, a post in every list in the app was a `Pressable` around
 * one `Text` holding the caption - in a media-sharing product. These tests are
 * the definition of the card, written before it existed.
 */
const author = {
  userId: 'u1',
  handle: 'ambaird',
  displayName: 'Ada Baird',
  bio: null,
  followerCount: 0,
  followingCount: 0,
  postCount: 0,
  interestFollowCount: 0,
  viewerIsFollowing: false,
  status: 'active' as const,
};

const interest = {
  interestId: 'INT#bouldering',
  name: 'Bouldering',
  slug: 'bouldering',
  level: 'top' as const,
};

const base: Post = {
  postId: 'p1',
  author,
  caption: 'Morning session at the gym.',
  interests: [interest],
  visibility: 'public',
  processingState: 'ready',
  mediaKind: 'images',
  media: [
    {
      kind: 'image',
      processingState: 'ready',
      width: 1200,
      height: 900,
      renditions: { original: 'https://example.test/a.jpg' },
    },
  ],
  reactionCount: 4,
  commentCount: 2,
  createdAt: '2026-01-01T00:00:00Z',
};

const renderCard = (post: Post) =>
  render(<PostCard post={post} onOpen={() => undefined} />);

/** The media frame's resolved height, which is what layout stability is about. */
const mediaHeight = (tree: ReturnType<typeof renderCard>, postId: string): unknown => {
  const style = StyleSheet.flatten(tree.getByTestId(`post-media-${postId}`).props.style) as {
    aspectRatio?: number;
    height?: number;
  };
  return style.aspectRatio ?? style.height;
};

describe('PostCard shows the post (006/US1)', () => {
  it('T013 renders media, author, caption, interest and counts', () => {
    const t = renderCard(base);

    // FR-001: the media, by URL, not a placeholder.
    expect(t.getByTestId('post-media-p1')).toBeTruthy();
    expect(t.getByTestId('post-image-p1').props.source).toEqual({
      uri: 'https://example.test/a.jpg',
    });
    // FR-002: the author, with an avatar.
    expect(t.getByText('Ada Baird')).toBeTruthy();
    expect(t.getByTestId('avatar-u1')).toBeTruthy();
    // FR-003: which interest this belongs to.
    expect(t.getByText('Bouldering')).toBeTruthy();
    // FR-004: the counts.
    expect(t.getByTestId('post-counts-p1')).toHaveTextContent(/4/);
    expect(t.getByTestId('post-counts-p1')).toHaveTextContent(/2/);
    // And the caption, on the testID .maestro already selects.
    expect(t.getByTestId('post-caption')).toHaveTextContent('Morning session at the gym.');
  });

  /**
   * FR-005, SC-006. A list must not shift as media arrives, so the frame is the
   * same size before and after - MEASURED, not asserted about the code.
   */
  it('T014 reserves the same space for a pending post as for a ready one', () => {
    const ready = mediaHeight(renderCard(base), 'p1');
    const pending = mediaHeight(
      renderCard({
        ...base,
        processingState: 'processing',
        media: [{ ...base.media![0]!, processingState: 'processing', renditions: {} }],
      }),
      'p1',
    );

    expect(pending).toBe(ready);
    // And the ratio is the one the contract gave, not a guess.
    expect(ready).toBeCloseTo(1200 / 900, 5);
  });

  it('T014 falls back to a fixed ratio when the contract carries no dimensions', () => {
    const noDims = renderCard({
      ...base,
      media: [{ kind: 'image', processingState: 'processing', renditions: {} }],
    });
    expect(mediaHeight(noDims, 'p1')).toBeGreaterThan(0);
  });

  it('T015 renders a post with no media as a text card, not an empty frame', () => {
    const t = renderCard({ ...base, media: [], mediaKind: 'images' });
    expect(t.queryByTestId('post-media-p1')).toBeNull();
    expect(t.getByTestId('post-caption')).toHaveTextContent('Morning session at the gym.');
  });

  /**
   * A failed post is visible only to its author - who is the one person that
   * needs to be told, rather than shown a blank rectangle forever.
   */
  it('T015 says so when processing failed', () => {
    const t = renderCard({
      ...base,
      processingState: 'failed',
      media: [{ ...base.media![0]!, processingState: 'failed', renditions: {} }],
    });
    expect(t.getByTestId('post-media-failed-p1')).toBeTruthy();
  });

  it('T016 renders a video by its poster frame and marks it as a video', () => {
    const t = renderCard({
      ...base,
      mediaKind: 'video',
      media: [
        {
          kind: 'video',
          processingState: 'ready',
          width: 1920,
          height: 1080,
          posterUrl: 'https://example.test/poster.jpg',
          renditions: { hls: 'https://example.test/index.m3u8' },
        },
      ],
    });
    expect(t.getByTestId('post-image-p1').props.source).toEqual({
      uri: 'https://example.test/poster.jpg',
    });
    // FR-006: identifiable as a video WITHOUT playing it.
    expect(t.getByTestId('post-video-badge-p1')).toBeTruthy();
  });

  it('is pressable across the card, so post detail is reachable from every list', () => {
    const onOpen = jest.fn();
    const t = render(<PostCard post={base} onOpen={onOpen} />);
    fireEvent.press(t.getByTestId('post-p1'));
    expect(onOpen).toHaveBeenCalledWith('p1');
  });
});

/**
 * 008/FR-003 — a browse surface says there is more than one, and stays a single
 * tap target.
 */
describe('008/US1 the multi-item indicator', () => {
  it('a card with three images shows the count', () => {
    const t = render(<PostCard post={multiImagePost} onOpen={() => undefined} />);
    expect(t.getByTestId(`post-media-count-${multiImagePost.postId}`)).toBeTruthy();
  });

  it('a card with one image shows no count', () => {
    const t = render(<PostCard post={singleImagePost} onOpen={() => undefined} />);
    expect(t.queryByTestId(`post-media-count-${singleImagePost.postId}`)).toBeNull();
  });

  it('a tile with three images shows the count', () => {
    const t = render(<PostTile post={multiImagePost} onOpen={() => undefined} />);
    expect(t.getByTestId(`post-media-count-${multiImagePost.postId}`)).toBeTruthy();
  });

  it('counts EVERY item, so the card and the pager always agree', () => {
    // Three items, one failed, and the count is three - because the pager shows
    // three, and the only viewer who can reach a post with a failed item is its
    // author. Two numbers for one post is how a card and a detail screen come to
    // disagree.
    expect(visibleMediaCount(partiallyFailedPost)).toBe(3);
  });

  it('stays ONE tap target - the card does not become navigable per item (FR-003)', () => {
    const opened: string[] = [];
    const t = render(<PostCard post={multiImagePost} onOpen={(id) => opened.push(id)} />);
    // No per-item pressable exists on a browse card. The only press is the card.
    expect(t.queryByTestId('media-pager')).toBeNull();
    fireEvent.press(t.getByTestId(`post-${multiImagePost.postId}`));
    expect(opened).toEqual([multiImagePost.postId]);
  });
});
