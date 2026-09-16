import type { Interest, InterestRef } from '@sih/shared';
import type { DataClient } from './client';

export interface InterestPage {
  items: Interest[];
  /**
   * THE CONTRACT'S SHAPE, and it was WRONG here until 007.
   *
   * Every list endpoint answers `{ items, page: { nextCursor, ... } }`. This
   * declared `nextCursor` at the TOP LEVEL, so `usePaged` read `undefined`,
   * concluded the list was exhausted, and the app COULD NEVER LOAD A SECOND
   * PAGE — of the feed, an interest space, a profile, comments or
   * notifications. Since the first page always arrived, every screen looked
   * correct.
   *
   * Nothing caught it because every mobile test stubs this type, so the stubs
   * were wrong in exactly the same way the code was: they agreed with each
   * other and neither agreed with the server. Only a request could find it, and
   * `apps/e2e` now makes one that asks for page two.
   */
  page: { nextCursor: string | null; emptyStateHint?: string | null };
}

/** Catalogue browse, search, create and follow (002/T020). */
export class InterestsData {
  constructor(private readonly client: DataClient) {}

  listTop(opts: { limit?: number; cursor?: string } = {}): Promise<InterestPage> {
    return this.client.call<InterestPage>('getInterests', {
      // 013. No `level` filter: interests are flat, so this lists them all.
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }

  /**
   * 013/FR-021. `listChildren` IS GONE, and it was not merely unused.
   *
   * `InterestContainer` still CALLED it on every interest screen and then threw
   * the result away under a comment saying interests are flat — a request per
   * open, carrying a `parentId` the server had stopped reading, for a list
   * nothing rendered. A call whose result nothing reads is the declared-half
   * shape this repository has recorded six times; deleting the method is what
   * makes the dead call a typecheck failure rather than a comment.
   */

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
   * 013/FR-004. `create` IS GONE with `POST /v1/interests`.
   *
   * It created an interest with no posts, which FR-004 makes unrepresentable.
   * Naming one happens on publish: `posts.publish({ interestNames })`, and the
   * near-duplicate refusal comes back as a 409 carrying the candidates so the
   * compose screen can offer "join this one instead" (FR-009, FR-010).
   *
   * The generated client no longer has `postInterests` at all, which is how
   * this was found rather than left as a method nothing could call.
   */

  follow(interestId: string): Promise<void> {
    return this.client.call<void>('putInterestsByInterestIdFollow', { params: { interestId } });
  }

  unfollow(interestId: string): Promise<void> {
    return this.client.call<void>('deleteInterestsByInterestIdFollow', { params: { interestId } });
  }

  /**
   * 004/FR-025, FR-030, 013/FR-002. The CREATOR, or an operator — there is no
   * curated tier for the rule to treat differently. The server decides: the app
   * does not hide the control based on a guess, it reports the refusal.
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
  /**
   * THE CONTRACT'S SHAPE, and it was WRONG here until 007.
   *
   * Every list endpoint answers `{ items, page: { nextCursor, ... } }`. This
   * declared `nextCursor` at the TOP LEVEL, so `usePaged` read `undefined`,
   * concluded the list was exhausted, and the app COULD NEVER LOAD A SECOND
   * PAGE — of the feed, an interest space, a profile, comments or
   * notifications. Since the first page always arrived, every screen looked
   * correct.
   *
   * Nothing caught it because every mobile test stubs this type, so the stubs
   * were wrong in exactly the same way the code was: they agreed with each
   * other and neither agreed with the server. Only a request could find it, and
   * `apps/e2e` now makes one that asks for page two.
   */
  page: { nextCursor: string | null; emptyStateHint?: string | null };
}

export type { InterestRef };
