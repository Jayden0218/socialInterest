import { actor, anonymous } from '../support/client';
import { publishReadyImage } from '../support/publish';
import type { Post } from '@sih/shared';

/**
 * EVERY surface that returns a post must return a POST, not a candidate row.
 *
 * This is the seventh guard against the defect this codebase produces most
 * often. Six have shipped: the feed, post detail, both comment paths,
 * notifications, a person's own profile - and, found by 004/US3 with a request
 * exactly like these, the INTEREST SPACE, which is the product's primary browse
 * surface and had no caption, no media, no author and no counts.
 *
 * It survives because nothing asks. The journeys compare postIds. The
 * visibility matrix tests the filter, not the response. The app renders
 * `caption ?? ''`, so a missing caption looks like a post without one. So this
 * file asks the only question that catches it: what did the server actually
 * send?
 */
const CANDIDATE_ONLY_KEYS = ['visibility', 'processingState', 'authorId'] as const;

function assertIsAPostNotACandidate(post: Post | undefined, surface: string, caption: string): void {
  if (!post) {
    throw new Error(`[${surface}] the post is not in the response at all`);
  }
  // On failure, say WHAT arrived rather than only that an assertion was false.
  // The interest-space defect survived six features because nothing ever
  // printed this.
  const shape = (): string =>
    `[${surface}] keys: ${Object.keys(post as unknown as Record<string, unknown>).join(',')}`;
  // The positive claim. A candidate row has none of these.
  expect({ shape: shape(), caption: post.caption }).toEqual({ shape: shape(), caption });
  expect({ shape: shape(), handle: Boolean(post.author?.handle) }).toEqual({ shape: shape(), handle: true });
  expect({ shape: shape(), interests: Array.isArray(post.interests) }).toEqual({ shape: shape(), interests: true });
  expect(post.interests.length).toBeGreaterThan(0);
  expect(typeof post.reactionCount).toBe('number');
  expect(typeof post.commentCount).toBe('number');

  // And the negative one: `authorId` at the top level is the tell of a raw
  // candidate or index row escaping as a response.
  const keys = Object.keys(post as unknown as Record<string, unknown>);
  const leaked = CANDIDATE_ONLY_KEYS.filter((k) => k === 'authorId' && keys.includes(k));
  expect({ surface, leaked }).toEqual({ surface, leaked: [] });
}

describe('no surface returns VisibilityFilter candidates as a response', () => {
  it('every list surface returns hydrated posts', async () => {
    const author = await actor('shapeAuthor');
    const viewer = await actor('shapeViewer');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    await viewer.data.interests.follow(interest.interestId);
    await viewer.data.people.follow(author.handle);

    const locality = `Shape-${Date.now().toString(36)}`;
    const place = await author.data.places.create({
      name: 'Shape Cafe',
      category: 'cafe',
      locality,
    });

    const caption = 'a caption every surface must carry';
    const postId = await publishReadyImage(author, [interest.interestId], {
      caption,
      placeId: place.placeId,
    });

    const interestSpace = await viewer.data.interests.posts(interest.interestId, { limit: 20 });
    assertIsAPostNotACandidate(
      interestSpace.items.find((p: Post) => p.postId === postId),
      'interest space',
      caption,
    );

    const feed = await viewer.data.feed.home({ limit: 50 });
    assertIsAPostNotACandidate(feed.items.find((p: Post) => p.postId === postId), 'home feed', caption);

    const profile = await viewer.data.people.posts(author.handle, { limit: 20 });
    assertIsAPostNotACandidate(profile.items.find((p: Post) => p.postId === postId), 'profile', caption);

    const placePage = await viewer.data.places.posts(place.placeId, { limit: 20 });
    assertIsAPostNotACandidate(
      placePage.items.find((p: Post) => p.postId === postId),
      'place page',
      caption,
    );

    const detail = await viewer.data.posts.get(postId);
    assertIsAPostNotACandidate(detail, 'post detail', caption);

    // Signed out too: an anonymous read goes down the same path with a null
    // viewer, which is a different branch of the filter.
    const anonSpace = await anonymous().interests.posts(interest.interestId, { limit: 20 });
    assertIsAPostNotACandidate(
      anonSpace.items.find((p: Post) => p.postId === postId),
      'interest space, signed out',
      caption,
    );
  }, 180_000);
});
