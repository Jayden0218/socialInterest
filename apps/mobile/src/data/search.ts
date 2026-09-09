import type { InterestRef, PublicProfile } from '@sih/shared';
import type { DataClient } from './client';
import type { PostPage } from './interests';

/**
 * 008/US6 — post text search.
 *
 * `fallback` arrives in the SAME response as an empty result (FR-022), so the
 * client renders the alternative without a second request and cannot show an
 * empty screen while it waits.
 */
export interface PostSearchPage extends PostPage {
  meta?: { terms?: string[] };
  fallback?: { interests: InterestRef[]; people: PublicProfile[] };
}

export class SearchData {
  constructor(private readonly client: DataClient) {}

  posts(q: string, opts: { limit?: number; cursor?: string } = {}): Promise<PostSearchPage> {
    return this.client.call<PostSearchPage>('getSearchPosts', {
      query: { q, limit: opts.limit, cursor: opts.cursor },
    });
  }
}
