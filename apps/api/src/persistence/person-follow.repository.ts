import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';

export interface PersonFollowItem {
  followerId: string;
  followeeId: string;
  followedAt: string;
  /**
   * 008/FR-043. ACCEPTED or PENDING, and ABSENT MEANS ACCEPTED.
   *
   * Every follow written before 008 carries no state and must keep working —
   * the same compatibility rule 005/FR-026 used for conversation state, and the
   * reason this is a field on the FOLLOW ROW rather than a second table: the
   * row is the relationship, and a request is that relationship in a different
   * state, not a different thing (005/R2).
   */
  state?: 'accepted' | 'pending';
}

/**
 * A10 - THE AUTHORITY FOR FR-015. "Can this viewer see a followers-only post?" is
 * the point read below, on the viewer's own partition, so it stays cheap on the
 * feed hot path.
 *
 * Built in Phase 2 rather than with US4, because the visibility filter depends on
 * it and the filter gates every story.
 *
 * NOTE: following an *interest* grants nothing here. That is the second easy
 * mistake named in contracts/visibility-matrix.md.
 */
@Injectable()
export class PersonFollowRepository extends BaseRepository {
  /**
   * 008/FR-043. Only an ACCEPTED follow counts.
   *
   * A pending request is somebody ASKING. Treating it as a follow would make
   * the request pointless — the content would already be readable while the
   * author was still deciding.
   */
  async isFollowing(followerId: string, followeeId: string): Promise<boolean> {
    const item = await this.getItem<PersonFollowItem>(keys.personFollow(followerId, followeeId));
    return item !== null && (item.state ?? 'accepted') === 'accepted';
  }

  /** The row whatever its state — for the request list and for approving. */
  async find(followerId: string, followeeId: string): Promise<PersonFollowItem | null> {
    return this.getItem<PersonFollowItem>(keys.personFollow(followerId, followeeId));
  }

  async setState(
    followerId: string,
    followeeId: string,
    state: 'accepted' | 'pending',
  ): Promise<void> {
    await this.updateItem(keys.personFollow(followerId, followeeId), { state });
  }

  async follow(followerId: string, followeeId: string, state?: 'accepted' | 'pending'): Promise<void> {
    await this.putItem({
      ...keys.personFollow(followerId, followeeId),
      ...keys.personFollowInverted(followeeId, followerId),
      type: 'PersonFollow',
      followerId,
      followeeId,
      followedAt: new Date().toISOString(),
      ...(state ? { state } : {}),
    });
  }

  async unfollow(followerId: string, followeeId: string): Promise<void> {
    await this.deleteItem(keys.personFollow(followerId, followeeId));
  }

  /**
   * A9 - who this person follows. ACCEPTED ONLY.
   *
   * 008/FR-043: filtered here rather than at each caller, because "who I follow"
   * feeds the Following surface, the follow cap and the ranking boost, and a
   * pending request granting any of the three would be the request answering
   * itself. One filter, in the place that owns the rows.
   */
  async listFollowing(
    followerId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<PersonFollowItem>> {
    const page = await this.query<PersonFollowItem>(`USER#${followerId}`, {
      skPrefix: SK_PREFIX.personFollow,
      limit: opts.limit ?? 50,
      cursor: opts.cursor ?? null,
    });
    return { ...page, items: page.items.filter((f) => (f.state ?? 'accepted') === 'accepted') };
  }

  /**
   * A52 / 008/FR-043 — MY PENDING FOLLOW REQUESTS.
   *
   * The inverted index (A11) filtered to `pending`: the same rows the follower
   * side wrote, read from the side that has to answer them. No second table,
   * so approving is a state change on the row that already exists and cannot
   * disagree with it.
   */
  async listPendingRequests(
    followeeId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<PersonFollowItem>> {
    const page = await this.listFollowersRaw(followeeId, opts);
    return { ...page, items: page.items.filter((f) => f.state === 'pending') };
  }

  /** A11 - who follows this person, via the inverted GSI. ACCEPTED ONLY. */
  async listFollowers(
    followeeId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<PersonFollowItem>> {
    const page = await this.listFollowersRaw(followeeId, opts);
    return { ...page, items: page.items.filter((f) => (f.state ?? 'accepted') === 'accepted') };
  }

  private async listFollowersRaw(
    followeeId: string,
    opts: { limit?: number; cursor?: string | null },
  ): Promise<Page<PersonFollowItem>> {
    return this.query<PersonFollowItem>(`USER#${followeeId}`, {
      indexName: 'gsi4',
      skPrefix: 'PFOLLOWER#',
      limit: opts.limit ?? 50,
      cursor: opts.cursor ?? null,
    });
  }
}
