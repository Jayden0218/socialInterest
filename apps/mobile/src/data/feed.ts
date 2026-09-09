import type { DataClient } from './client';
import type { PostPage } from './interests';

/**
 * Home feed and interest spaces (002/T022).
 *
 * RANKED from what the person does (007, constitution 2.0.0 Principle I as
 * amended). It is no longer composed from followed interests - 001/FR-033 and
 * FR-032 are withdrawn.
 *
 * 008/US3 ADDS A SECOND SURFACE, and the comment that used to sit here said
 * there deliberately was not one: "a follower feed is not this product". That
 * was true of the ranked feed's SELECTION and was never true of the app, which
 * has rendered a Following tab since 007 - disabled, with a code comment saying
 * it was not built. `following()` below is that tab's other half.
 *
 * The two are separate calls rather than one with a flag, because the guard
 * proving Following cannot rank (`following-feed-is-unranked.spec.ts`) works by
 * the service being unable to import the ranker - which a shared path defeats.
 *
 * The cursor is OPAQUE and carries what this session has already been shown, so
 * it must be passed back unmodified. Reconstructing one from a timestamp would
 * repeat posts, which is the FR-008 failure.
 */
export class FeedData {
  constructor(private readonly client: DataClient) {}

  home(opts: { limit?: number; cursor?: string } = {}): Promise<PostPage> {
    return this.client.call<PostPage>('getFeedHome', {
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }

  /**
   * 008/FR-008. Posts by the people you follow, newest first.
   *
   * The cursor here is a TIMESTAMP rather than the home feed's opaque token, and
   * it is still passed back unmodified for the same reason: what it means is the
   * server's business, and a client that built one would be reimplementing the
   * paging rule in a second place.
   */
  following(opts: { limit?: number; cursor?: string } = {}): Promise<PostPage> {
    return this.client.call<PostPage>('getFeedFollowing', {
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }
}
