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

  /**
   * 004/FR-025, FR-030. Operators for a top-level interest; the creator or an
   * operator for a sub-interest. The server decides - the app does not hide the
   * control based on a guess, it reports the refusal.
   */
  setDescription(interestId: string, description: string): Promise<void> {
    return this.client.call<void>('putInterestsByInterestIdDescription', {
      params: { interestId },
      body: { description },
    });
  }

  /**
   * 004/FR-027 to FR-029.
   *
   * `order` REORDERS what `new` returns and never changes which posts come
   * back; `q` matches captions after the visibility filter, never before.
   */
  posts(
    interestId: string,
    opts: { limit?: number; cursor?: string; order?: 'new' | 'top'; q?: string } = {},
  ): Promise<PostPage> {
    return this.client.call<PostPage>('getInterestsByInterestIdPosts', {
      params: { interestId },
      query: { limit: opts.limit, cursor: opts.cursor, order: opts.order, q: opts.q },
    });
  }
}

export interface PostPage {
  items: import('@sih/shared').Post[];
  nextCursor?: string;
}

export type { InterestRef };
