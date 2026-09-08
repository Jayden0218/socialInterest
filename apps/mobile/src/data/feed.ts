import type { DataClient } from './client';
import type { PostPage } from './interests';

/**
 * Home feed and interest spaces (002/T022).
 *
 * RANKED from what the person does (007, constitution 2.0.0 Principle I as
 * amended). It is no longer composed from followed interests - 001/FR-033 and
 * FR-032 are withdrawn - and there is still deliberately no "all posts by people
 * I follow" call here. That absence used to be Principle I's boundary; it is now
 * simply the fact that a follower feed is not this product.
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
}
