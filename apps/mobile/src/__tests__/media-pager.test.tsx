import { render } from '@testing-library/react-native';
import { MediaPager } from '../components/MediaPager';
import { multiImagePost, partiallyFailedPost, singleImagePost, tenImagePost, videoPost } from './fixtures/post';

/**
 * 008/T015, US1 — THE WHOLE POST.
 *
 * The publish screen has always promised "up to 10 photos". The server has
 * always returned all of them, presigned, in publication order — `keys.mediaItem`
 * sorts on a zero-padded `MEDIA#000`, so the order is structural and needs no
 * field. And every render path in this app read `post.media[0]`.
 *
 * So nine of ten photographs were invisible **to everyone including the author,
 * permanently**, and 190 green mobile tests said nothing about it, because every
 * post fixture in the suite carried exactly one media item.
 *
 * These tests are written before `MediaPager` exists.
 */
describe('008/FR-001 every ready item is reachable', () => {
  it('renders one page per media item, in publication order', () => {
    const t = render(<MediaPager post={multiImagePost} />);
    const pages = t.getAllByTestId(/^media-page-/);
    expect(pages).toHaveLength(3);
    // Order is the array's order, which is the server's `MEDIA#nnn` order.
    expect(pages.map((p) => p.props.testID)).toEqual([
      'media-page-0',
      'media-page-1',
      'media-page-2',
    ]);
  });

  it('renders all ten of a ten-photograph post (SC-001)', () => {
    const t = render(<MediaPager post={tenImagePost} />);
    expect(t.getAllByTestId(/^media-page-/)).toHaveLength(10);
  });

  it('renders each item with its OWN url, so "renders all" cannot pass by repeating one', () => {
    const t = render(<MediaPager post={multiImagePost} />);
    const uris = t.getAllByTestId(/^media-image-/).map((i) => (i.props.source as { uri: string }).uri);
    expect(new Set(uris).size).toBe(3);
  });
});

describe('008/FR-002 position within a set of more than one', () => {
  it('shows the position for a multi-item post', () => {
    const t = render(<MediaPager post={multiImagePost} />);
    // `children` is [1, ' / ', 3] - numbers, not strings - so join before
    // asserting. A `toContain('1')` on the raw array passes for '10' too.
    expect(t.getByTestId('media-position').props.children.join('')).toBe('1 / 3');
  });

  it('shows NO indicator for a single item', () => {
    const t = render(<MediaPager post={singleImagePost} />);
    expect(t.queryByTestId('media-position')).toBeNull();
  });

  it('shows no indicator for a single video either', () => {
    const t = render(<MediaPager post={videoPost} />);
    expect(t.queryByTestId('media-position')).toBeNull();
  });
});

describe('008/FR-004 a failed item is accounted for', () => {
  it('the failed slot is rendered and counted among the pages', () => {
    const t = render(<MediaPager post={partiallyFailedPost} />);
    expect(t.getAllByTestId(/^media-page-/)).toHaveLength(3);
    expect(t.getByTestId('media-failed-1')).toBeTruthy();
  });

  /**
   * FR-004's SECOND half - "visible only to the author" - is deliberately NOT
   * tested here, because it is not this component's to enforce and a test here
   * would assert a client-side visibility decision into existence.
   *
   * The chain that delivers it is two server rules, and the test that a partial
   * failure reaches only its author is
   * `apps/api/tests/visibility/matrix.spec.ts`, row "not ready".
   */
  it('is only ever rendered for the author, by a chain this component is not part of', () => {
    // `ProcessingService.reconcile`: any failed item => the POST is `failed`.
    // `VisibilityFilter.decide`: a non-ready post is visible to its author only.
    // So a viewer holding this post IS the author. Pinning the premise here
    // means that if either server rule changes, this reads as a stale comment
    // rather than as a guarantee nobody re-checked.
    expect(partiallyFailedPost.media!.some((m) => m.processingState === 'failed')).toBe(true);
  });
});
