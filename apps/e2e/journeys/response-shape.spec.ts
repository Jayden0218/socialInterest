import { actor, anonymous } from '../support/client';
import { baseUrl } from '../support/base-url';
import { raw } from '../support/http';
import { eventually } from '../support/eventually';
import { publishReadyImage } from '../support/publish';
import { jpegPlain } from '../support/media';
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

/**
 * 007/T053 — THE NOTIFICATION THUMBNAIL IS A RESPONSE FIELD, SO IT IS ASKED FOR.
 *
 * `Activity.dc.html` shows a thumbnail beside a post row, and the field that
 * carries it (`postThumbUrl`) is served from the post `listVisible` already
 * fetched to decide visibility. Every previous instance of a response-shape
 * defect in this codebase survived because nothing asked what the server
 * actually sent, so this asks — on the same principle as the file above it.
 *
 * Three claims, and the third is the one that matters:
 *
 *   1. A reaction notification carries a url.
 *   2. A follow notification carries null — there is no post.
 *   3. It is a REAL, FETCHABLE url, not a raw key. `MinioObjectStore.publicUrl`
 *      returned an unsigned url for a private bucket for five features, and
 *      nothing noticed until something rendered an image (006/R4b). A string
 *      that is present but 403s is exactly that defect again.
 */
describe('007/T053 the notification thumbnail', () => {
  it('is present for a post notification, null for a follow, and actually fetchable', async () => {
    const author = await actor('thumbAuthor');
    const reactor = await actor('thumbReactor');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'thumb' });

    await reactor.data.engagement.react(postId);
    await reactor.data.people.follow(author.handle);

    /**
     * WAITED FOR, not slept on. Notifications are produced through the event
     * bus, so a single read races the pipeline - and 004 records four tests in
     * this repository that waited for a DURATION instead of a condition and
     * were red in CI and green locally. The condition is both kinds present.
     */
    const page = await eventually(
      () => author.data.notifications.list({ limit: 20 }),
      (p) => p.items.some((n) => n.kind === 'reaction') && p.items.some((n) => n.kind === 'follow'),
      { timeoutMs: 15_000, describe: 'a reaction and a follow notification' },
    );

    const reaction = page.items.find((n) => n.kind === 'reaction' && n.postId === postId);
    expect({ found: Boolean(reaction), kinds: page.items.map((n) => n.kind) })
      .toMatchObject({ found: true });
    expect(typeof reaction!.postThumbUrl).toBe('string');

    const follow = page.items.find((n) => n.kind === 'follow')!;
    // Null, not absent and not an empty string: there is no post, and the
    // client renders no tile.
    expect(follow!.postThumbUrl ?? null).toBeNull();

    // The claim a present string does not make. A presigned GET issued after
    // VisibilityFilter decided should answer 200; an unsigned url against a
    // private bucket answers 403, which is the shape of 006's five-feature
    // defect.
    const res = await fetch(reaction!.postThumbUrl as string);
    expect({ status: res.status, url: reaction!.postThumbUrl }).toMatchObject({ status: 200 });
  }, 120_000);
});

/**
 * ===========================================================================
 * 008/T008 - EVERY DECLARED FIELD MUST HAVE A WRITER.
 * ===========================================================================
 *
 * Feature 008 exists because of a pattern found three times independently: a
 * field or a control is declared, is returned to every client or rendered on
 * every screen, and THE OTHER HALF WAS NEVER WRITTEN.
 *
 *   - `Notification.readAt` is in the schema, is returned on every notification,
 *     and nothing anywhere writes it. Every notification is unread forever.
 *   - `PublicProfile.avatarUrl` is in the schema and is emitted on ONE of seven
 *     profile projections - as the raw storage key, which a private bucket
 *     answers 403 to. `avatarKey` has no writer at all.
 *   - The publish screen promises "up to 10 photos" and every render path reads
 *     `media[0]`.
 *
 * WHAT THIS GUARD DOES: for each field below whose writer is supposed to exist,
 * fetch a real response and assert the field is non-null in at least one case.
 * A schema field that is never populated by anything is the defect; a fixture
 * that never populates it is the only way to catch that from outside.
 *
 * WHAT IT DOES NOT DO, said plainly because a guard that reads as more coverage
 * than it is, is worse than none: it cannot catch a field the SERVER populates
 * correctly and a CLIENT ignores. That is 007's `ApiPage<T>` defect - five
 * features of green tests, because every mobile test stubbed the data layer and
 * the stubs were wrong in exactly the same way the type was, so they agreed with
 * each other and neither agreed with the server. Only a request finds that, and
 * only a rendering test finds `media[0]`. Both live elsewhere.
 *
 * THE RATCHET. `hasWriter: false` means the writer has not landed yet, and the
 * field is REPORTED as pending rather than asserted - the same shape as
 * `apps/api/tests/visibility/surfaces.ts`, and for the same reason: asserting a
 * field before its feature exists turns the suite red for every unrelated task
 * until it lands, which is how a signal stops being read. Flipping one to `true`
 * is the last step of the story that writes it.
 */
interface DeclaredField {
  /** Schema and field, as a reader of `packages/shared` would name it. */
  readonly path: string;
  /** The story that gives it a writer. */
  readonly writer: string;
  /** False = pending, reported not asserted. Flipped by the story that lands it. */
  readonly hasWriter: boolean;
  /** Produces one observed value. Non-null is the assertion. */
  readonly observe: () => Promise<unknown>;
}

const DECLARED_FIELDS: readonly DeclaredField[] = [
  {
    path: 'Notification.readAt',
    writer: '008/US2 (T031) - the read watermark',
    hasWriter: true,
    observe: async () => {
      const author = await actor('readAtAuthor');
      const reactor = await actor('readAtReactor');
      const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
      const postId = await publishReadyImage(author, [interest.interestId], { caption: 'readAt' });
      await reactor.data.engagement.react(postId);

      await eventually(
        () => author.data.notifications.list({ limit: 20 }),
        (p) => p.items.some((n) => n.kind === 'reaction'),
        { timeoutMs: 15_000, describe: 'a reaction notification' },
      );

      /**
       * Over RAW HTTP, not the app's data layer, and deliberately so while this
       * guard is being verified red: the data layer gains `markAllRead` with
       * 008/T035, and a guard that cannot compile until its fix lands cannot be
       * watched failing first. `apps/e2e/journeys/notification-read.spec.ts`
       * drives the app's own layer once it exists; this one only asks whether
       * anything at all writes the field.
       */
      await raw(`${baseUrl()}/v1`, '/notifications/read', { method: 'PUT', token: author.token });
      const after = await author.data.notifications.list({ limit: 20 });
      return after.items.find((n) => n.kind === 'reaction')?.readAt ?? null;
    },
  },
  {
    path: 'PublicProfile.avatarUrl',
    writer: '008/US5 (T082) - PATCH /me accepts avatarUploadId',
    hasWriter: true,
    observe: async () => {
      const me = await actor('avatarField');
      const bytes = jpegPlain();
      const target = await me.data.posts.createUploadTarget({
        kind: 'avatar',
        contentType: 'image/jpeg',
        sizeBytes: bytes.byteLength,
      });
      await me.data.posts.uploadBytes(target, bytes, 'image/jpeg');
      await me.data.session.updateProfile({ avatarUploadId: target.uploadId });
      // Read back from a DIFFERENT surface than the one that wrote it, so a
      // PATCH echoing its own input would not satisfy this.
      const viewer = await actor('avatarFieldViewer');
      return (await viewer.data.people.get(me.handle)).avatarUrl ?? null;
    },
  },
];

describe('008/FR-054 every declared field has a writer', () => {
  for (const field of DECLARED_FIELDS.filter((f) => f.hasWriter)) {
    it(`${field.path} is populated by something (${field.writer})`, async () => {
      const value = await field.observe();
      // Report the field name on failure. "expected null not to be null" says
      // nothing; the whole point of this guard is naming WHICH promise is empty.
      expect({ field: field.path, populated: value !== null && value !== undefined })
        .toEqual({ field: field.path, populated: true });
    }, 120_000);
  }

  it('lists the declared fields still waiting for a writer, so none is forgotten', () => {
    const pending = DECLARED_FIELDS.filter((f) => !f.hasWriter).map((f) => `${f.path} <- ${f.writer}`);
    console.log(`\ndeclared fields still without a writer: ${pending.join(', ') || 'none'}\n`);
    // Deliberately not an assertion. A pending field is honest work in progress;
    // a pending field nobody can see is the defect.
    expect(Array.isArray(pending)).toBe(true);
  });
});
