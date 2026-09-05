import type { Interest, InterestRef } from '@sih/shared';
import type { DataClient } from './client';

export interface InterestPage {
  items: Interest[];
  nextCursor?: string;
}

/** Catalogue browse, search, create and follow (002/T020). */
export class InterestsData {
  constructor(private readonly client: DataClient) {}

  listTop(opts: { limit?: number; cursor?: string } = {}): Promise<InterestPage> {
    return this.client.call<InterestPage>('getInterests', {
      query: { level: 'top', limit: opts.limit, cursor: opts.cursor },
    });
  }

  listChildren(parentId: string, opts: { limit?: number; cursor?: string } = {}): Promise<InterestPage> {
    return this.client.call<InterestPage>('getInterests', {
      query: { parentId, limit: opts.limit, cursor: opts.cursor },
    });
  }

  search(q: string): Promise<InterestPage> {
    return this.client.call<InterestPage>('getInterests', { query: { q } });
  }

  suggested(): Promise<InterestPage> {
    return this.client.call<InterestPage>('getInterestsSuggested');
  }

  get(interestId: string): Promise<Interest> {
    return this.client.call<Interest>('getInterestsByInterestId', { params: { interestId } });
  }

  /**
   * A near-duplicate name is refused with 409 carrying `candidates` as an RFC 9457
   * extension. Re-submitting with acknowledgedSimilarTo is how the person says
   * "different thing, same-ish name" (FR-029).
   */
  create(input: {
    name: string;
    parentId: string;
    description?: string;
    acknowledgedSimilarTo?: string[];
  }): Promise<Interest> {
    return this.client.call<Interest>('postInterests', { body: input });
  }

  follow(interestId: string): Promise<void> {
    return this.client.call<void>('putInterestsByInterestIdFollow', { params: { interestId } });
  }

  unfollow(interestId: string): Promise<void> {
    return this.client.call<void>('deleteInterestsByInterestIdFollow', { params: { interestId } });
  }

  posts(interestId: string, opts: { limit?: number; cursor?: string } = {}): Promise<PostPage> {
    return this.client.call<PostPage>('getInterestsByInterestIdPosts', {
      params: { interestId },
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }
}

export interface PostPage {
  items: import('@sih/shared').Post[];
  nextCursor?: string;
}

export type { InterestRef };
