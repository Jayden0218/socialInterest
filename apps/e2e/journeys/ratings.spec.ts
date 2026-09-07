import { actor, anonymous } from '../support/client';

/**
 * 005/US1 over HTTP, through the app's own data layer.
 *
 * The point of this file rather than the integration suite: these calls go
 * through `apps/mobile/src/data`, the code the app actually runs. 002 found five
 * defects the moment that happened, none of which any contract test could see -
 * both sides of a contract are generated from one document and agree with each
 * other by construction.
 */
const uniqueLocality = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('005/US1 - rating a place', () => {
  /** SC-001. */
  it('J-20 a rating is given and the average is readable by somebody else within a second', async () => {
    const rater = await actor('ratingRater');
    const reader = await actor('ratingReader');
    const place = await rater.data.places.create({
      name: 'Rated Cafe',
      category: 'cafe',
      locality: uniqueLocality('rate'),
    });

    const started = Date.now();
    const res = await rater.data.places.rate(place.placeId, { score: 4 });
    expect(res.summary).toEqual({ average: 4, count: 1 });

    // Read by a DIFFERENT person, because "I can see my own rating" is satisfied
    // by a client that never sent it.
    const seen = await reader.data.places.get(place.placeId);
    const elapsed = Date.now() - started;

    expect(seen.ratingSummary).toEqual({ average: 4, count: 1 });
    expect(elapsed).toBeLessThan(1000);
  });

  /** SC-003 and FR-002, over the wire. */
  it('J-21 rating twice replaces rather than adds (SC-003)', async () => {
    const rater = await actor('ratingTwice');
    const place = await rater.data.places.create({
      name: 'Twice Rated',
      category: 'bar',
      locality: uniqueLocality('twice'),
    });

    await rater.data.places.rate(place.placeId, { score: 5 });
    await rater.data.places.rate(place.placeId, { score: 1 });

    const seen = await rater.data.places.get(place.placeId);
    expect(seen.ratingSummary).toEqual({ average: 1, count: 1 });
    expect(seen.viewerRating).toBe(1);
  });

  /**
   * SC-002. The displayed average must match the ratings behind it EXACTLY.
   *
   * Twelve places rather than the criterion's hundred: each place needs its own
   * creator to stay inside FR-046's creation limit, so a hundred would be a
   * hundred sign-ups for an arithmetic property that a dozen establishes just as
   * well. Recorded rather than quietly scaled down - SC-002 says 100, and this
   * is 12, and the reason is rate limits rather than the property being weaker.
   */
  it('J-22 the displayed average matches the ratings behind it, across many places (SC-002)', async () => {
    const scoreSets = [
      [5], [1], [3, 4], [1, 5], [2, 2, 2], [1, 2, 3], [5, 5, 4], [4, 3], [2, 5, 1],
      [3], [4, 4, 4, 4], [1, 1, 5, 5],
    ];

    for (const scores of scoreSets) {
      const owner = await actor('avgOwner');
      const place = await owner.data.places.create({
        name: `Average ${Math.random().toString(36).slice(2, 8)}`,
        category: 'other',
        locality: uniqueLocality('avg'),
      });

      for (const score of scores) {
        const rater = await actor('avgRater');
        await rater.data.places.rate(place.placeId, { score });
      }

      const expected = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
      const seen = await anonymous().places.get(place.placeId);
      expect(seen.ratingSummary).toEqual({ average: expected, count: scores.length });
    }
  });

  /** FR-003. */
  it('J-23 withdrawing a rating recomputes the average without it', async () => {
    const a = await actor('withdrawA');
    const b = await actor('withdrawB');
    const place = await a.data.places.create({
      name: 'Withdrawn From',
      category: 'shop',
      locality: uniqueLocality('withdraw'),
    });

    await a.data.places.rate(place.placeId, { score: 5 });
    await b.data.places.rate(place.placeId, { score: 1 });
    expect((await a.data.places.get(place.placeId)).ratingSummary).toEqual({ average: 3, count: 2 });

    await a.data.places.withdrawRating(place.placeId);
    expect((await a.data.places.get(place.placeId)).ratingSummary).toEqual({ average: 1, count: 1 });

    await b.data.places.withdrawRating(place.placeId);
    // FR-005 again, at the end of the sequence: back to UNRATED, not to zero.
    expect((await a.data.places.get(place.placeId)).ratingSummary).toEqual({ average: null, count: 0 });
  });

  /** FR-005, on a place nobody has touched. */
  it('J-24 an unrated place reports no average rather than zero', async () => {
    const owner = await actor('unratedOwner');
    const place = await owner.data.places.create({
      name: 'Never Rated',
      category: 'venue',
      locality: uniqueLocality('unrated'),
    });

    const seen = await anonymous().places.get(place.placeId);
    expect(seen.ratingSummary).toEqual({ average: null, count: 0 });
    expect(seen.ratingSummary?.average).not.toBe(0);
  });

  /** FR-006. */
  it('J-25 a signed-out visitor reads the average and cannot rate', async () => {
    const owner = await actor('signedOutOwner');
    const place = await owner.data.places.create({
      name: 'Read By Anyone',
      category: 'cafe',
      locality: uniqueLocality('anon'),
    });
    await owner.data.places.rate(place.placeId, { score: 4 });

    const seen = await anonymous().places.get(place.placeId);
    expect(seen.ratingSummary).toEqual({ average: 4, count: 1 });

    await expect(anonymous().places.rate(place.placeId, { score: 1 })).rejects.toThrow();

    // And the refusal changed nothing.
    expect((await anonymous().places.get(place.placeId)).ratingSummary).toEqual({
      average: 4,
      count: 1,
    });
  });
});
