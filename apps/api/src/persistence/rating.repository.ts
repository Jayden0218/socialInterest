import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { ITEM_TYPE_005, SK_PREFIX, keys } from './keys';
import { aggregateDelta } from '../ratings/aggregate';

export interface RatingItem {
  placeId: string;
  userId: string;
  score: number;
  /** 005/FR-009. Null is a rating with no review text, which is complete. */
  body: string | null;
  createdAt: string;
  updatedAt: string;
  /** 005/FR-015. Set by a moderator decision; the row survives so the log can name it. */
  removedByModeration?: boolean;
}

/**
 * Ratings and reviews (005/US1, US2).
 *
 * TWO ROWS PER RATING, one under each partition:
 *
 *   PLACE#<placeId>  RATING#<userId>   the rating itself, listed on the place page
 *   USER#<userId>    RATED#<placeId>   "have I rated this?", without reading the place
 *
 * The place-partition key is what enforces FR-002 - at most one rating per person
 * per place - because a second submission writes the same key. The constraint
 * lives in the key, so no code path can violate it and no test has to prove that
 * every path checks. Same argument as `reaction` for FR-039.
 */
@Injectable()
export class RatingRepository extends BaseRepository {
  async find(placeId: string, userId: string): Promise<RatingItem | null> {
    return this.getItem<RatingItem>(keys.rating(placeId, userId));
  }

  /**
   * Write or replace a rating, and move the place's counters, ATOMICALLY.
   *
   * The transaction is the point (research R5). The replace case must add the new
   * score and subtract the old one; a crash between those two writes leaves the
   * place permanently mis-rated, and nothing afterwards could detect it - there
   * is no screen that shows the sum, and recomputing it would need the unbounded
   * query this design exists to avoid.
   *
   * Exactly two items, so the transaction is always far inside DynamoDB's limits.
   */
  async put(input: {
    placeId: string;
    userId: string;
    score: number;
    body: string | null;
    now: string;
  }): Promise<RatingItem> {
    const { placeId, userId, score, body, now } = input;
    const existing = await this.find(placeId, userId);
    const delta = aggregateDelta({ previous: existing?.score ?? null, next: score });

    const item: RatingItem = {
      placeId,
      userId,
      score,
      body,
      // A replaced rating keeps the moment it was first given; only the edit moves.
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.transact([
      {
        Put: {
          TableName: this.tableName,
          // ONLY the place-partition key. Spreading `ratingByPerson` here too
          // would overwrite pk and sk with USER#/RATED#, so this row would land
          // in the wrong partition and `find()` would return null forever - a
          // rating that appears to save and then does not exist.
          Item: {
            ...keys.rating(placeId, userId),
            type: ITEM_TYPE_005.rating,
            ...item,
          },
        },
      },
      this.counterUpdate(placeId, delta),
    ]);

    // The "have I rated this?" row, under the person's own partition. A separate
    // write because it lives in a different partition from the rating and its
    // place, and DynamoDB transactions cannot span an item twice.
    await this.putItem({
      ...keys.ratingByPerson(userId, placeId),
      type: ITEM_TYPE_005.rating,
      placeId,
      userId,
      score,
    });

    return item;
  }

  /** FR-003. Removes the rating and its score from the place, atomically. */
  async remove(placeId: string, userId: string): Promise<boolean> {
    const existing = await this.find(placeId, userId);
    if (!existing) return false;
    const delta = aggregateDelta({ previous: existing.score, next: null });

    await this.transact([
      { Delete: { TableName: this.tableName, Key: keys.rating(placeId, userId) } },
      this.counterUpdate(placeId, delta),
    ]);
    await this.deleteItem(keys.ratingByPerson(userId, placeId));
    return true;
  }

  /**
   * FR-015 / FR-016. A moderator removal, which takes the score with it (R6).
   *
   * The row is MARKED rather than deleted, so the moderation log's subject id
   * still resolves to something and the decision remains auditable. The place's
   * counters move exactly as a withdrawal's do - which is why both go through
   * `aggregateDelta` rather than each doing their own arithmetic.
   */
  async setRemovedByModeration(placeId: string, userId: string): Promise<boolean> {
    const existing = await this.find(placeId, userId);
    if (!existing || existing.removedByModeration) return false;
    const delta = aggregateDelta({ previous: existing.score, next: null });

    await this.transact([
      {
        Update: {
          TableName: this.tableName,
          Key: keys.rating(placeId, userId),
          UpdateExpression: 'SET removedByModeration = :t',
          ExpressionAttributeValues: { ':t': true },
        },
      },
      this.counterUpdate(placeId, delta),
    ]);
    return true;
  }

  /**
   * A35. A place's ratings.
   *
   * Ordered by user id, not recency - the sort key is `RATING#<userId>`, so the
   * caller sorts by `updatedAt`. That is right for a place with tens of reviews
   * and wrong for one with thousands, and it is a recorded decision rather than
   * an oversight (data-model.md § A35). The fix, when it is needed, is a
   * `RATING#<updatedAt>#<userId>` sort key plus a uniqueness item, or a real
   * search backend.
   */
  async listByPlace(placeId: string, opts: { limit?: number; cursor?: string } = {}): Promise<Page<RatingItem>> {
    return this.query<RatingItem>(`PLACE#${placeId}`, {
      skPrefix: SK_PREFIX.rating,
      ascending: true,
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
      ...(opts.cursor !== undefined ? { cursor: opts.cursor } : {}),
    });
  }

  /**
   * The counter half of every transaction above.
   *
   * `if_not_exists` on both counters is what lets a place written before 005
   * receive its first rating: the attributes simply are not there, and `ADD` on a
   * missing attribute would fail rather than treat it as zero.
   */
  private counterUpdate(placeId: string, delta: { sum: number; count: number }) {
    return {
      Update: {
        TableName: this.tableName,
        Key: keys.place(placeId),
        UpdateExpression:
          'SET ratingSum = if_not_exists(ratingSum, :z) + :s, ratingCount = if_not_exists(ratingCount, :z) + :c',
        ExpressionAttributeValues: { ':z': 0, ':s': delta.sum, ':c': delta.count },
        // The place must exist. Without this a rating for a deleted or mistyped
        // place would CREATE a stub place item carrying nothing but two counters.
        ConditionExpression: 'attribute_exists(pk)',
      },
    };
  }
}
