import { actor, anonymous } from '../support/client';

/**
 * 005/US2 over HTTP, through the app's own data layer.
 *
 * SC-004 is the one that matters here, and it is asserted in BOTH DIRECTIONS
 * separately. "People I blocked cannot see my reviews" and "I cannot see reviews
 * by people who blocked me" are different guarantees, and an implementation that
 * checks one way passes a single-direction test while leaking the other - which
 * looks exactly like shipping both.
 */
const uniqueLocality = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('005/US2 - reviews on a place', () => {
  it('J-26 a review is written and read by somebody else, hydrated (FR-010)', async () => {
    const author = await actor('revAuthor');
    const reader = await actor('revReader');
    const place = await author.data.places.create({
      name: 'Reviewed Place',
      category: 'restaurant',
      locality: uniqueLocality('review'),
    });

    await author.data.places.rate(place.placeId, { score: 5, body: 'Worth the queue.' });

    const seen = await reader.data.places.reviews(place.placeId);
    expect(seen.items).toHaveLength(1);
    // The AUTHOR is a profile, not an id. Six surfaces in this codebase shipped
    // returning raw candidate rows because nothing asked.
    expect(seen.items[0]).toMatchObject({
      placeId: place.placeId,
      score: 5,
      body: 'Worth the queue.',
      author: { handle: author.handle },
    });
    expect(seen.items[0]!.author.displayName).toEqual(expect.any(String));
  });

  /** SC-004, direction one: the viewer blocked the author. */
  it('J-27 a review by somebody the viewer has blocked is absent (SC-004)', async () => {
    const author = await actor('blockedRevAuthor');
    const viewer = await actor('blockingViewer');
    const place = await author.data.places.create({
      name: 'Blocked Author Place',
      category: 'cafe',
      locality: uniqueLocality('blockdir1'),
    });
    await author.data.places.rate(place.placeId, { score: 1, body: 'Terrible.' });

    // Visible before the block, so the absence afterwards means the block and
    // not a review that never existed.
    expect((await viewer.data.places.reviews(place.placeId)).items).toHaveLength(1);

    await viewer.data.safety.block(author.handle);
    expect((await viewer.data.places.reviews(place.placeId)).items).toHaveLength(0);
  });

  /** SC-004, direction two: the author blocked the viewer. */
  it('J-28 a review by somebody who has blocked the viewer is absent (SC-004)', async () => {
    const author = await actor('blockingRevAuthor');
    const viewer = await actor('blockedViewer');
    const place = await author.data.places.create({
      name: 'Blocking Author Place',
      category: 'bar',
      locality: uniqueLocality('blockdir2'),
    });
    await author.data.places.rate(place.placeId, { score: 2, body: 'Not for me.' });

    expect((await viewer.data.places.reviews(place.placeId)).items).toHaveLength(1);

    await author.data.safety.block(viewer.handle);
    expect((await viewer.data.places.reviews(place.placeId)).items).toHaveLength(0);
  });

  /**
   * 004/FR-006 carried across: severance is COMPUTED, not stored, so unblocking
   * restores the review because nothing was destroyed.
   */
  it('J-29 unblocking restores the review, because nothing was deleted', async () => {
    const author = await actor('unblockRevAuthor');
    const viewer = await actor('unblockViewer');
    const place = await author.data.places.create({
      name: 'Unblocked Place',
      category: 'shop',
      locality: uniqueLocality('unblock'),
    });
    await author.data.places.rate(place.placeId, { score: 4, body: 'Came back.' });

    await viewer.data.safety.block(author.handle);
    expect((await viewer.data.places.reviews(place.placeId)).items).toHaveLength(0);

    await viewer.data.safety.unblock(author.handle);
    expect((await viewer.data.places.reviews(place.placeId)).items).toHaveLength(1);
  });

  /**
   * The AGGREGATE is deliberately NOT filtered per viewer - it is the same
   * number for everybody, including a viewer who blocked a reviewer.
   *
   * That is a stated, accepted leak of a kind (addendum § 5): a determined
   * viewer could in principle detect a blocked person's effect on an average by
   * arithmetic. Filtering it per viewer would make it not an average, and would
   * need the unbounded query research R5 exists to avoid. Asserted here so the
   * behaviour is pinned rather than discovered.
   */
  it('J-30 the average is the same number for everybody, blocks included', async () => {
    const author = await actor('aggRevAuthor');
    const viewer = await actor('aggViewer');
    const place = await author.data.places.create({
      name: 'Aggregate Place',
      category: 'venue',
      locality: uniqueLocality('agg'),
    });
    await author.data.places.rate(place.placeId, { score: 1, body: 'One star.' });
    await viewer.data.places.rate(place.placeId, { score: 5 });

    await viewer.data.safety.block(author.handle);

    // The review is hidden...
    expect((await viewer.data.places.reviews(place.placeId)).items).toHaveLength(0);
    // ...and its score still counts, for everyone.
    expect((await viewer.data.places.get(place.placeId)).ratingSummary).toEqual({
      average: 3,
      count: 2,
    });
  });

  it('J-31 a signed-out visitor reads reviews', async () => {
    const author = await actor('anonRevAuthor');
    const place = await author.data.places.create({
      name: 'Public Reviews',
      category: 'cafe',
      locality: uniqueLocality('anonrev'),
    });
    await author.data.places.rate(place.placeId, { score: 5, body: 'Open to all.' });

    const seen = await anonymous().places.reviews(place.placeId);
    expect(seen.items).toHaveLength(1);
    expect(seen.items[0]!.body).toBe('Open to all.');
  });
});
