import { Module } from '@nestjs/common';
import { RatingService } from './rating.service';
import { ReviewQueryService } from './review-query.service';

/**
 * Ratings and reviews (005).
 *
 * Top-level rather than folded into PlacesModule, per plan.md's structure
 * decision: a rating is written from the place page but is not a property of a
 * place, and this is the only module that writes to another entity's item. That
 * is worth being visible in the module graph rather than buried.
 */
@Module({
  providers: [RatingService, ReviewQueryService],
  exports: [RatingService, ReviewQueryService],
})
export class RatingsModule {}
