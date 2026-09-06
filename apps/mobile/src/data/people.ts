import type { Post, PublicProfile } from '@sih/shared';
import type { DataClient } from './client';

export interface PostPage {
  items: Post[];
  nextCursor?: string;
}

/**
 * Another person's profile, their posts, and following them (003/T053).
 *
 * This module did not exist. `putPeopleByHandleFollow` and its delete twin were
 * in the contract, in the generated client and implemented by the API, and the
 * app had no way to call either: `ProfileContainer` loaded only the signed-in
 * person's own profile through `session.me()`, hardcoded `viewerIsFollowing:
 * false`, and wired its follow button to `() => undefined`.
 *
 * So a person could not follow anyone from the product, and the app could not
 * demonstrate the premise of constitution Principle I - the requirement that
 * following a person must NOT widen the feed presupposes that following a
 * person is possible at all. The service enforced it; nothing in the app could
 * show it.
 *
 * Found while writing the FR-033 device journey, which had to establish the
 * person-follow server-side because the app could not.
 */
export class PeopleData {
  constructor(private readonly client: DataClient) {}

  /**
   * Someone else's profile. Carries `viewerIsFollowing`, which the API computes
   * per viewer - so the follow control reflects the server's answer rather than
   * a guess the client made.
   */
  get(handle: string): Promise<PublicProfile> {
    return this.client.call<PublicProfile>('getPeopleByHandle', { params: { handle } });
  }

  posts(handle: string, opts: { limit?: number; cursor?: string } = {}): Promise<PostPage> {
    return this.client.call<PostPage>('getPeopleByHandlePosts', {
      params: { handle },
      query: { limit: opts.limit, cursor: opts.cursor },
    });
  }

  follow(handle: string): Promise<void> {
    return this.client.call<void>('putPeopleByHandleFollow', { params: { handle } });
  }

  unfollow(handle: string): Promise<void> {
    return this.client.call<void>('deletePeopleByHandleFollow', { params: { handle } });
  }
}
