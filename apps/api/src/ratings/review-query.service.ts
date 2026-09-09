import { Inject, Injectable } from '@nestjs/common';
import { PersonRepository } from '../persistence/person.repository';
import { RatingRepository, type RatingItem } from '../persistence/rating.repository';
import { AuthoredContentVisibility } from '../visibility/authored-content';
import { ProfileProjection, type ProfileSource } from '../modules/people/profile.projection';
import type { Viewer } from '../visibility/visibility.filter';

/**
 * THE ONE RESPONDER FOR A REVIEW'S SHAPE (005/US2).
 *
 * Same argument as one `VisibilityFilter`, applied to the shape rather than the
 * decision. Six surfaces in this codebase have shipped returning raw persistence
 * rows - the interest space, the product's PRIMARY BROWSE SURFACE, returned rows
 * with no caption, no media, no author and no counts, and survived because
 * nothing asked. The filter decides what is visible; it never decides the shape
 * of what to send.
 *
 * So every path that returns a review comes through here: the PUT that creates
 * one, and the list on the place page. Two responders would be the feed's
 * hand-rolled second responder again, where `interestIds` was sent for a
 * contract promising `interests` and a generated client crashed on it.
 */
@Injectable()
export class ReviewQueryService {
  constructor(
    @Inject(RatingRepository) private readonly ratings: RatingRepository,
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(AuthoredContentVisibility) private readonly visibility: AuthoredContentVisibility,
    @Inject(ProfileProjection) private readonly profiles: ProfileProjection,
  ) {}

  /** One review, hydrated. The author is a profile, never an id. */
  async responseFor(item: RatingItem, _viewer: Viewer): Promise<Record<string, unknown> | null> {
    const author = await this.people.findById(item.userId);
    if (!author) return null;
    return this.hydrate(item, author);
  }

  /**
   * A place's reviews, through the visibility boundary (FR-012, FR-013).
   *
   * `AuthoredContentVisibility` rather than a block check written here - that is
   * research R4 and constitution principle II. This service does not know how a
   * block is resolved and must not learn.
   *
   * Removed reviews are dropped by the boundary (they carry
   * `removedByModeration`), so FR-016's "does not appear" and the aggregate's
   * "does not count" are two consequences of one flag rather than two rules that
   * could disagree.
   */
  async listByPlace(
    viewer: Viewer,
    placeId: string,
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<{ items: Record<string, unknown>[]; page: { nextCursor: string | null } }> {
    const page = await this.ratings.listByPlace(placeId, opts);

    // A rating with no text is not a review. It counts toward the average and has
    // nothing to display, so returning it would put empty rows on the page.
    const withText = page.items.filter((r) => r.body !== null && r.body !== '');

    const cache = this.visibility.newRequestCache();
    const visible = await this.visibility.filter(
      viewer,
      withText.map((r) => ({ ...r, authorId: r.userId })),
      cache,
    );

    const authors = await Promise.all(visible.map((r) => this.people.findById(r.userId)));
    const hydrated = await Promise.all(
      visible.map((r, i) => (authors[i] ? this.hydrate(r, authors[i]!) : Promise.resolve(null))),
    );
    const items = hydrated
      .filter((r): r is Record<string, unknown> => r !== null)
      // A35's stated limit: the sort key is `RATING#<userId>`, so the datastore
      // returns them in user-id order. Sorted here, newest first, which is right
      // for tens of reviews and wrong for thousands - a recorded decision, in
      // data-model.md, not an oversight.
      .sort((a, b) => String(b['updatedAt']).localeCompare(String(a['updatedAt'])));

    return { items, page: { nextCursor: page.nextCursor ?? null } };
  }

  /**
   * The contract shape, and ONLY the contract shape.
   *
   * Built field by field rather than spread from the persistence row. A spread is
   * how `originalKey` - the path of the pre-strip upload - leaked out of the
   * media record, and how six surfaces returned candidate rows. Adding a field to
   * `RatingItem` must not silently add it to the API.
   */
  private async hydrate(item: RatingItem, author: ProfileSource): Promise<Record<string, unknown>> {
    return {
      placeId: item.placeId,
      // 008/US5. One projection. `avatarKey` was already threaded into this
      // function's signature and then DROPPED on the next line - the shape of
      // near-miss this story exists to end.
      author: await this.profiles.toPublicProfile(author),
      score: item.score,
      body: item.body,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
