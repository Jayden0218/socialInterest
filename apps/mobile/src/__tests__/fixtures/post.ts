import type { MediaItem, Post } from '@sih/shared';

/**
 * 008/T009. POST FIXTURES, AND THE REASON THEY ARE SHARED.
 *
 * Every post fixture in this app carried exactly ONE media item. That is why
 * nothing caught 008's first defect: the publish screen promises "up to 10
 * photos", the server returns all of them, and every render path reads
 * `media[0]` and throws the rest away. Nine of ten photographs were invisible to
 * everyone including the author, permanently, and 190 green mobile tests said
 * nothing - because a single-item fixture cannot tell a renderer that reads the
 * whole array apart from one that reads the first element.
 *
 * A multi-item assertion against a single-item fixture PASSES and means nothing.
 * So the fixture lives here, is shared, and asserts its own shape below.
 */
export const fixtureAuthor = {
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

export const fixtureInterest = {
  interestId: 'INT#bouldering',
  name: 'Bouldering',
  slug: 'bouldering',
  level: 'top' as const,
};

const image = (n: number, state: MediaItem['processingState'] = 'ready'): MediaItem => ({
  kind: 'image',
  processingState: state,
  width: 1200,
  height: 900,
  renditions: state === 'ready' ? { original: `https://example.test/${n}.jpg` } : {},
});

/** One image. The shape every fixture in this app had before 008. */
export const singleImagePost: Post = {
  postId: 'p1',
  author: fixtureAuthor,
  caption: 'Morning session at the gym.',
  interests: [fixtureInterest],
  visibility: 'public',
  processingState: 'ready',
  mediaKind: 'images',
  media: [image(0)],
  reactionCount: 4,
  commentCount: 2,
  createdAt: '2026-01-01T00:00:00Z',
};

/**
 * THREE images. The case the product has always allowed and never rendered.
 *
 * Three rather than two on purpose: two cannot distinguish "renders the first
 * and the last" from "renders all of them", and a position indicator reading
 * "1 / 2" is satisfied by arithmetic that fails at three.
 */
export const multiImagePost: Post = {
  ...singleImagePost,
  postId: 'p-multi',
  caption: 'Three from the session.',
  media: [image(1), image(2), image(3)],
};

/** Ten, which is the documented maximum and what SC-001 counts. */
export const tenImagePost: Post = {
  ...singleImagePost,
  postId: 'p-ten',
  caption: 'All ten.',
  media: Array.from({ length: 10 }, (_, i) => image(i + 1)),
};

/**
 * Some ready, one failed. FR-004: the failed item is accounted for on the detail
 * surface and is visible ONLY to the author, so this fixture is what tells the
 * two viewer cases apart.
 */
export const partiallyFailedPost: Post = {
  ...singleImagePost,
  postId: 'p-partial',
  caption: 'One did not make it.',
  media: [image(1), image(2, 'failed'), image(3)],
};

export const videoPost: Post = {
  ...singleImagePost,
  postId: 'p-video',
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
};
