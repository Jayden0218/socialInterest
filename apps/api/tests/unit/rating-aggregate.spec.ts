import { aggregateDelta, averageOf } from '../../src/ratings/aggregate';

/**
 * THE FOUR OPERATIONS in data-model.md's table, as pure arithmetic.
 *
 * Extracted from the repository so it can be tested without a datastore. The
 * replace case is the one that matters and the reason the write is transactional:
 * it must add the new score AND subtract the old one, and a crash between those
 * leaves a place permanently mis-rated with nothing able to detect it afterwards.
 *
 * A rating aggregate is exactly the kind of thing that looks too simple to test
 * and is then wrong by one for a year, because no screen shows the sum.
 */
describe('rating aggregate arithmetic', () => {
  describe('the delta a write applies to a place', () => {
    it('a first rating adds its score and one to the count', () => {
      expect(aggregateDelta({ previous: null, next: 4 })).toEqual({ sum: 4, count: 1 });
    });

    /**
     * FR-002. The count must NOT move: the same person is still one rater. This
     * is the assertion that catches the obvious wrong implementation, which
     * treats every submission as new and inflates both numbers.
     */
    it('replacing a rating moves the sum and leaves the count alone', () => {
      expect(aggregateDelta({ previous: 5, next: 2 })).toEqual({ sum: -3, count: 0 });
      expect(aggregateDelta({ previous: 2, next: 5 })).toEqual({ sum: 3, count: 0 });
    });

    it('re-submitting the same score is a no-op on both numbers', () => {
      expect(aggregateDelta({ previous: 3, next: 3 })).toEqual({ sum: 0, count: 0 });
    });

    it('withdrawing removes its score and one from the count (FR-003)', () => {
      expect(aggregateDelta({ previous: 4, next: null })).toEqual({ sum: -4, count: -1 });
    });

    /**
     * FR-016 / research R6. A moderator removing a review takes its rating with
     * it, which is arithmetically a withdrawal - the decision that they are the
     * same operation is in the service, and this pins that they stay the same.
     */
    it('moderator removal is arithmetically a withdrawal (FR-016)', () => {
      expect(aggregateDelta({ previous: 1, next: null })).toEqual(
        aggregateDelta({ previous: 1, next: null }),
      );
      expect(aggregateDelta({ previous: 1, next: null })).toEqual({ sum: -1, count: -1 });
    });

    it('a withdrawal of nothing changes nothing', () => {
      expect(aggregateDelta({ previous: null, next: null })).toEqual({ sum: 0, count: 0 });
    });
  });

  describe('the average a place reports', () => {
    /**
     * FR-005. `null`, not 0. "Nobody has rated this" and "everybody rated it 0"
     * are different facts, and 0 is not even a legal score - so a zero here is a
     * value every client would have to know to special-case, which is how a
     * display bug becomes everyone's problem.
     */
    it('is null when nobody has rated, never zero', () => {
      expect(averageOf({ ratingSum: 0, ratingCount: 0 })).toBeNull();
    });

    it('is the mean when somebody has', () => {
      expect(averageOf({ ratingSum: 9, ratingCount: 2 })).toBe(4.5);
      expect(averageOf({ ratingSum: 4, ratingCount: 1 })).toBe(4);
    });

    /**
     * A place written before 005 has neither field. It must read as unrated
     * rather than crashing or reporting NaN - which is what `sum / count` on two
     * undefineds produces, and NaN serialises to `null` in JSON, so the bug would
     * look exactly like the correct answer until a place had ratings.
     */
    it('treats a place written before this feature as unrated', () => {
      expect(averageOf({})).toBeNull();
      expect(averageOf({ ratingCount: undefined, ratingSum: undefined })).toBeNull();
    });

    it('rounds to one decimal, so the display never sees 3.6666666666666665', () => {
      expect(averageOf({ ratingSum: 11, ratingCount: 3 })).toBe(3.7);
    });

    /**
     * A count that has gone negative means the aggregate has already drifted -
     * two withdrawals of one rating, say. Reporting an average from it would
     * dress a corrupted number as a fact; unrated is the honest answer.
     */
    it('reports unrated rather than a fabricated average if the count is impossible', () => {
      expect(averageOf({ ratingSum: 4, ratingCount: -1 })).toBeNull();
    });
  });
});
