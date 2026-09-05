import type { DataClient } from './client';
import type { PostPage } from './interests';

/**
 * Home feed and interest spaces (002/T022).
 *
 * The home feed is composed from FOLLOWED INTERESTS. Following a person never
 * widens it beyond those - constitution Principle I, FR-033. There is deliberately
 * no "all posts by people I follow" call here; adding one would be the change the
 * principle forbids.
 */
export class FeedData {
  constructor(private readonly client: DataClient) {}

  home(opts: { limit?: number; cursor?: string } = {}): Promise<PostPage> {
    return this.client.call<PostPage>('getFeedHome', {
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }
}
