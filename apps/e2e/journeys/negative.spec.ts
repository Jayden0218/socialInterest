import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';
import { baseUrl } from '../support/base-url';
import { raw } from '../support/http';
import { mintForgedToken, mintPublishedSecretToken } from '../support/identity';
import { e2eEnv } from '../support/env';

/**
 * These deliberately bypass apps/mobile/src/data and issue raw requests.
 *
 * A server-side guarantee tested only through the well-behaved first-party client
 * is not tested at all - constitution Principle III. Every assertion here is about
 * what a modified client cannot get.
 */
describe('negative journeys - driven as a hostile client', () => {
  it('N-01 rejects an unauthenticated request to a protected route', async () => {
    const noToken = await raw(baseUrl(), '/v1/feed/home');
    expect(noToken.status).toBe(401);

    // A syntactically valid JWT signed with the wrong key is not a way in.
    const forged = await raw(baseUrl(), '/v1/feed/home', { token: mintForgedToken() });
    expect(forged.status).toBe(401);
  });

  it('N-02 does not return a private post to a non-author', async () => {
    const author = await actor('n2author');
    const stranger = await actor('n2stranger');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], { visibility: 'private' });

    const asAuthor = await raw(baseUrl(), `/v1/posts/${postId}`, { token: author.token });
    expect(asAuthor.status).toBe(200);

    // Exists, but not for you: 403, distinct from the 404 a block returns.
    const asStranger = await raw(baseUrl(), `/v1/posts/${postId}`, { token: stranger.token });
    expect(asStranger.status).toBe(403);
    expect(JSON.stringify(asStranger.body)).not.toContain(author.userId);
  });

  it('N-03 does not return a blocked person post on any surface', async () => {
    const author = await actor('n3author');
    const blocker = await actor('n3blocker');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId]);

    await blocker.data.safety.block(author.handle);

    // 404, not 403: a 403 would confirm the post exists and disclose the block.
    const direct = await raw(baseUrl(), `/v1/posts/${postId}`, { token: blocker.token });
    expect(direct.status).toBe(404);

    const space = await raw(baseUrl(), `/v1/interests/${interest.interestId}/posts?limit=50`, {
      token: blocker.token,
    });
    expect(space.status).toBe(200);
    expect(JSON.stringify(space.body)).not.toContain(postId);

    const comments = await raw(baseUrl(), `/v1/posts/${postId}/comments`, { token: blocker.token });
    expect(comments.status).toBe(404);
  });

  it('N-04 does not serve media to a viewer who may not see it', async () => {
    const author = await actor('n4author');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], { visibility: 'private' });

    const detail = await raw(baseUrl(), `/v1/posts/${postId}`, { token: author.token });
    const media = (detail.body as { media?: { renditions?: Record<string, string> }[] }).media ?? [];
    const key = media[0]?.renditions?.['original'];
    expect(key).toBeTruthy();

    // Straight at the object store, no signature, no session. This is the request
    // a hostile client makes once it has guessed or scraped a key.
    const unsigned = await fetch(`${e2eEnv.s3Endpoint}/${e2eEnv.bucket}/${key}`);
    expect(unsigned.ok).toBe(false);
    expect([401, 403, 404]).toContain(unsigned.status);
  });
  /**
   * T034 / 003/FR-007. The old default secret was a constant in this
   * repository, so anyone who read it could mint a token the service accepted
   * for any subject they liked - including an operator.
   *
   * The service now refuses to boot with that value at all, so a token signed
   * with it cannot verify. This asserts the consequence from the outside, where
   * an attacker stands.
   *
   * The refusal must also be INDISTINGUISHABLE from any other bad token. A
   * distinct status or message for "you used the published secret" tells the
   * holder they have the right idea and the wrong deployment, which is a
   * signal worth nothing to a legitimate client and something to an attacker.
   */
  it('N-05 refuses a token signed with the published development secret, indistinguishably', async () => {
    const published = await raw(baseUrl(), '/v1/feed/home', { token: mintPublishedSecretToken() });
    const forged = await raw(baseUrl(), '/v1/feed/home', { token: mintForgedToken() });

    expect(published.status).toBe(401);
    expect(published.status).toBe(forged.status);
    expect(JSON.stringify(published.body)).toBe(JSON.stringify(forged.body));

    // And it buys nothing anywhere else, including the operator-only surface.
    const moderation = await raw(baseUrl(), '/v1/moderation/reports', {
      token: mintPublishedSecretToken(),
    });
    expect([401, 403]).toContain(moderation.status);
  });
});

/**
 * 005, THROUGH THE PATH A MODIFIED CLIENT WOULD TAKE.
 *
 * Constitution principle III: a server-side guarantee tested only through the
 * well-behaved first-party client is not tested at all - and the modified client
 * is the one that will exist. Everything here bypasses apps/mobile/src/data.
 */
describe('005 - server-side guarantees, asked rudely', () => {
  const uniqueLocality = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const makePlace = async (owner: Awaited<ReturnType<typeof actor>>) =>
    owner.data.places.create({
      name: `Rude ${Math.random().toString(36).slice(2, 8)}`,
      category: 'other',
      locality: uniqueLocality('rude'),
    });

  /**
   * SC-004, but through a raw request rather than the data layer.
   *
   * The app filtering a blocked person's review out of a list it received is not
   * the guarantee. The guarantee is that the server never sends it.
   */
  it('N-06 a blocked person\'s review is absent from the raw response, both directions', async () => {
    const author = await actor('rudeRevAuthor');
    const viewer = await actor('rudeViewer');
    const place = await makePlace(author);
    await author.data.places.rate(place.placeId, { score: 1, body: 'Hidden soon.' });

    const before = await raw(baseUrl(), `/v1/places/${place.placeId}/reviews`, {
      token: viewer.token,
    });
    expect(before.status).toBe(200);
    expect((before.body as { items: unknown[] }).items).toHaveLength(1);

    await viewer.data.safety.block(author.handle);
    const afterViewerBlocks = await raw(baseUrl(), `/v1/places/${place.placeId}/reviews`, {
      token: viewer.token,
    });
    expect((afterViewerBlocks.body as { items: unknown[] }).items).toHaveLength(0);

    // The other direction, with a second pair - the same assertion is only worth
    // making twice if the two blocks are independent.
    const author2 = await actor('rudeRevAuthor2');
    const viewer2 = await actor('rudeViewer2');
    const place2 = await makePlace(author2);
    await author2.data.places.rate(place2.placeId, { score: 1, body: 'Also hidden.' });
    await author2.data.safety.block(viewer2.handle);

    const afterAuthorBlocks = await raw(baseUrl(), `/v1/places/${place2.placeId}/reviews`, {
      token: viewer2.token,
    });
    expect((afterAuthorBlocks.body as { items: unknown[] }).items).toHaveLength(0);
  });

  /**
   * FR-001 and the general lesson behind FR-031: a constraint enforced only
   * where the well-behaved client passes through is not enforced. A 7 would
   * corrupt this place's average permanently, and nothing would ever detect it.
   */
  it('N-07 refuses an out-of-range score sent past the client', async () => {
    const owner = await actor('rudeRater');
    const place = await makePlace(owner);

    for (const score of [0, 6, 99, -3, 2.5, '5', null]) {
      const res = await raw(baseUrl(), `/v1/places/${place.placeId}/rating`, {
        token: owner.token,
        method: 'PUT',
        body: JSON.stringify({ score }),
      });
      expect([400, 422]).toContain(res.status);
    }

    const place2 = await owner.data.places.get(place.placeId);
    expect(place2.ratingSummary).toEqual({ average: null, count: 0 });
  });

  /**
   * A review body longer than the contract allows. Not a security boundary, but
   * an unbounded write into a row every place-page reader fetches.
   */
  it('N-08 refuses an oversized review body sent past the client', async () => {
    const owner = await actor('rudeReviewer');
    const place = await makePlace(owner);

    const res = await raw(baseUrl(), `/v1/places/${place.placeId}/rating`, {
      token: owner.token,
      method: 'PUT',
      body: JSON.stringify({ score: 4, body: 'x'.repeat(5000) }),
    });
    expect([400, 422]).toContain(res.status);
  });
});
