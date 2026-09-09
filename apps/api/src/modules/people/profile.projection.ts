import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORE, type ObjectStore } from '../../ports';
import type { PersonItem } from '../../persistence/person.repository';

/** The minimum any caller has about a person. A `PersonItem` is a superset. */
export interface ProfileSource {
  userId: string;
  handle: string;
  displayName: string;
  avatarKey?: string | null;
  bio?: string | null;
  followerCount?: number;
  followingCount?: number;
  /**
   * 008/FR-043. Reported, never used to decide anything — see the note in
   * `toPublicProfile`.
   */
  accountPrivacy?: 'open' | 'private';
}

/**
 * THE ONE PLACE A `PublicProfile` IS BUILT (008/US5, research R5).
 *
 * Before this, seven modules constructed one by hand and `avatarUrl` appeared on
 * exactly ONE of them — `person.controller.ts`, where it was `avatarUrl:
 * p.avatarKey`: THE RAW STORAGE KEY, presented as a URL. Against a private
 * bucket a client gets a 403, which is precisely 006/R4b's
 * `MinioObjectStore.publicUrl` defect reproduced in a second place.
 *
 * And `avatarKey` had no writer at all. The upload kind `avatar` is accepted by
 * `POST /v1/media/uploads` and `media.limits.ts` has an `avatar` entry — the
 * upload half was built and the setting half never was. A fifth instance of the
 * pattern feature 008 exists to end.
 *
 * Seven hand-written projections is seven chances to omit a field, which is the
 * same argument as one `VisibilityFilter` and one `PostQueryService.responseFor`
 * — and this codebase has shipped the response-shape version of that defect
 * SEVEN times. `tests/unit/one-profile-projection.spec.ts` fails the build if a
 * module outside this file builds one again.
 *
 * PRESIGNED, AND ONLY AFTER A DECISION. The url is issued here, at projection
 * time, which every caller reaches only once the boundary has decided the viewer
 * may have the thing the profile is attached to. Presigning is bounded
 * authorisation; an open bucket is not, which is why 006 reverted one.
 */
@Injectable()
export class ProfileProjection {
  constructor(@Inject(OBJECT_STORE) private readonly store: ObjectStore) {}

  async toPublicProfile(person: ProfileSource): Promise<Record<string, unknown>> {
    return {
      userId: person.userId,
      handle: person.handle,
      displayName: person.displayName,
      avatarUrl: person.avatarKey ? await this.store.presignedGetUrl(person.avatarKey) : null,
      ...(person.bio !== undefined ? { bio: person.bio } : {}),
      ...(person.followerCount !== undefined ? { followerCount: person.followerCount } : {}),
      ...(person.followingCount !== undefined ? { followingCount: person.followingCount } : {}),
      /**
       * 008/FR-043 — THE SETTING, REPORTED ON EVERY PROFILE.
       *
       * A client has to be able to say "this account is private" and draw
       * "Request to follow" instead of "Follow". Emitted from the ONE
       * projection rather than the profile endpoint, for the reason this file
       * exists: `avatarUrl` was emitted on one of seven projections and that
       * cost a whole story to fix.
       *
       * Reporting a setting is not deciding with it. Nothing in this file asks
       * whether a viewer may see anything — `privacy-is-not-per-surface.spec.ts`
       * names this file as a place that CARRIES the field, alongside the two
       * that set it, and the boundary remains the only place that acts on it
       * when answering "may this viewer see this post".
       */
      accountPrivacy: person.accountPrivacy ?? 'open',
    };
  }

  /**
   * A person who could not be loaded.
   *
   * Every call site had its own version of this — `'Unknown'`, `'Unavailable'`,
   * and in one case a `handle` of `'unavailable'`. Keeping them in one place
   * means a client sees one shape for one situation, and means the next surface
   * cannot invent an eighth word for it.
   */
  unknown(userId: string): Record<string, unknown> {
    return { userId, handle: 'unavailable', displayName: 'Unavailable', avatarUrl: null };
  }

  /** Convenience for the common `PersonItem | null` case. */
  async fromPerson(userId: string, person: PersonItem | null): Promise<Record<string, unknown>> {
    return person ? this.toPublicProfile(person) : this.unknown(userId);
  }
}
