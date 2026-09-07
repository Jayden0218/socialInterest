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

  /**
   * MEDIA IS A RESPONSE SHAPE TOO, and it was the seventh instance.
   *
   * `media` used to be the raw persistence record, spread into the response.
   * `posterUrl` - which FR-009 exists for - appears nowhere in the API source,
   * so no client ever got a thumbnail. And `originalKey` went out with it: the
   * storage path of the ORIGINAL, pre-EXIF-strip upload.
   */
  const INTERNAL_MEDIA_FIELDS = ['postId', 'type', 'ordinal', 'originalKey', 'posterKey'] as const;

  it('media items carry URLs, not storage keys, and leak no internal fields', async () => {
    const author = await actor('mediaShape');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'media shape' });

    const post = await author.data.posts.get(postId);
    const media = post.media ?? [];
    expect(media.length).toBeGreaterThan(0);

    for (const item of media) {
      const keys = Object.keys(item as unknown as Record<string, unknown>);
      const leaked = INTERNAL_MEDIA_FIELDS.filter((f) => keys.includes(f));
      // `originalKey` is the one that matters most: it names the object holding
      // the upload as the author sent it, before the server stripped anything.
      expect({ keys, leaked }).toEqual({ keys, leaked: [] });
      expect(item.kind).toBeTruthy();
      expect(typeof item.processingState).toBe('string');
    }
  }, 120_000);

  /**
   * 005. Reviews, on the same terms as posts.
   *
   * `PostQueryService.listByAuthor` once returned VisibilityFilter's CANDIDATE
   * rows as the response - caption null, no media, no counts, no author - and
   * the interest space, the product's primary browse surface, shipped the same
   * way. Six instances. The filter decides what is VISIBLE; it never decides the
   * SHAPE of what to send.
   *
   * These fields are the persistence row's, and none of them belongs in a
   * response: `userId` is an id where the contract promises a hydrated profile,
   * and `removedByModeration` tells a reader that something was moderated here.
   */
  const INTERNAL_REVIEW_FIELDS = ['userId', 'removedByModeration', 'type', 'pk', 'sk'] as const;

  it('reviews come back hydrated, on every path that returns one', async () => {
    const author = await actor('reviewShape');
    const reader = await actor('reviewShapeReader');
    const place = await author.data.places.create({
      name: `Shape ${Math.random().toString(36).slice(2, 8)}`,
      category: 'cafe',
      locality: `Shape-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });

    // Path 1: the response to writing one.
    const written = await author.data.places.rate(place.placeId, { score: 4, body: 'Shape check.' });
    // Path 2: the list on the place page, read by somebody else.
    const listed = (await reader.data.places.reviews(place.placeId)).items;
    expect(listed).toHaveLength(1);

    for (const review of [written.rating, listed[0]!]) {
      const keys = Object.keys(review as unknown as Record<string, unknown>);
      const leaked = INTERNAL_REVIEW_FIELDS.filter((f) => keys.includes(f));
      expect({ keys, leaked }).toEqual({ keys, leaked: [] });

      // And the fields the contract promises are PRESENT and hydrated - the
      // half a leak check cannot cover, and the half six surfaces failed.
      expect(review.placeId).toBe(place.placeId);
      expect(review.score).toBe(4);
      expect(review.body).toBe('Shape check.');
      expect(review.author.handle).toBe(author.handle);
      expect(review.author.displayName).toEqual(expect.any(String));
      expect(review.createdAt).toEqual(expect.any(String));
      expect(review.updatedAt).toEqual(expect.any(String));
    }
  });

  /**
   * The rating summary, which is a different shape defect: an average that
   * arrives as 0 rather than null makes every unrated place look badly rated,
   * and no leak check would notice.
   */
  it('a place carries a rating summary whose average is null, not zero, when unrated', async () => {
    const owner = await actor('summaryShape');
    const place = await owner.data.places.create({
      name: `Summary ${Math.random().toString(36).slice(2, 8)}`,
      category: 'shop',
      locality: `Summary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });

    const fetched = await owner.data.places.get(place.placeId);
    expect(fetched.ratingSummary).toEqual({ average: null, count: 0 });
    expect(fetched.ratingSummary?.average).not.toBe(0);
  });
});
