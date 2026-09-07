import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/problem.filter';
import { PlaceRepository } from '../persistence/place.repository';
import { RatingRepository, type RatingItem } from '../persistence/rating.repository';
import { averageOf } from './aggregate';

export interface RatingSummary {
  average: number | null;
  count: number;
}

/**
 * Ratings and reviews (005/US1, US2).
 *
 * A top-level module rather than a service inside `places/`, for the reason
 * 001/D6 gives about `VisibilityFilter`: a rating is written from the place page
 * but is not a property of a place, and the aggregate it maintains is the one
 * thing on the place item that another module writes. Burying that inside
 * `places/` would hide the only cross-module write in the system.
 */
@Injectable()
export class RatingService {
  constructor(
    @Inject(RatingRepository) private readonly ratings: RatingRepository,
    @Inject(PlaceRepository) private readonly places: PlaceRepository,
  ) {}

  /**
   * FR-001, FR-002, FR-008.
   *
   * The score is validated HERE as well as at the controller's schema, because
   * FR-031's lesson applies to every constraint: a rule enforced only where the
   * well-behaved client passes through is not enforced. A 7-star rating would
   * otherwise corrupt every average on the place permanently.
   */
  async rate(input: {
    placeId: string;
    userId: string;
    score: number;
    body: string | null;
  }): Promise<{ rating: RatingItem; summary: RatingSummary }> {
    const { placeId, userId, score, body } = input;
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new DomainError(HttpStatus.BAD_REQUEST, 'A rating must be a whole number from 1 to 5');
    }

    const place = await this.places.find(placeId);
    if (!place) throw new DomainError(HttpStatus.NOT_FOUND, 'No such place');

    const rating = await this.ratings.put({
      placeId,
      userId,
      score,
      body: body?.trim() ? body.trim() : null,
      now: new Date().toISOString(),
    });

    return { rating, summary: await this.summaryFor(placeId) };
  }

  /** FR-003. Idempotent: withdrawing a rating you do not have is not an error. */
  async withdraw(placeId: string, userId: string): Promise<RatingSummary> {
    const place = await this.places.find(placeId);
    if (!place) throw new DomainError(HttpStatus.NOT_FOUND, 'No such place');
    await this.ratings.remove(placeId, userId);
    return this.summaryFor(placeId);
  }

  /**
   * FR-004, FR-005.
   *
   * Read from the place item's own counters, which every place-page request
   * already fetches - so the summary costs nothing extra. `averageOf` is what
   * makes an unrated place `null` rather than 0.
   */
  async summaryFor(placeId: string): Promise<RatingSummary> {
    const place = await this.places.find(placeId);
    if (!place) return { average: null, count: 0 };
    return this.summaryOf(place);
  }

  /** The same, for a place already in hand. Avoids a second read on the place page. */
  summaryOf(place: { ratingSum?: number; ratingCount?: number }): RatingSummary {
    return {
      average: averageOf(place),
      count: Math.max(0, place.ratingCount ?? 0),
    };
  }

  /** FR-002 on the read side: the control renders in the state the person left it. */
  async viewerRating(placeId: string, userId: string | null): Promise<number | null> {
    if (!userId) return null;
    const own = await this.ratings.find(placeId, userId);
    return own && !own.removedByModeration ? own.score : null;
  }
}
