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
    const rendition = media[0]?.renditions?.['original'];
    expect(rendition).toBeTruthy();

    /**
     * THE KEY, EXTRACTED - and this test did not do that until 006.
     *
     * `renditions.original` is a full URL, not a key. The previous version built
     * `${s3Endpoint}/${bucket}/${rendition}`, nesting a URL inside a URL, and
     * fetched something like
     * `http://127.0.0.1:9000/sih-media/http://127.0.0.1:9000/sih-media/media/x.jpg`.
     *
     * That is nonsense and the object store errors on it whatever the bucket
     * permits, so the assertion passed for a reason unrelated to the guarantee.
     * It was noticed only when a bucket policy changed the error from 404 to 400
     * and the test went red without anything about access having changed.
     *
     * Any query string goes too: a presigned URL carries its authorisation
     * there, and the request a hostile client makes has none.
     */
    const url = new URL(rendition!);
    const key = url.pathname.replace(`/${e2eEnv.bucket}/`, '');
    expect(key).not.toContain('://');
    expect(key.length).toBeGreaterThan(0);

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

  /**
   * SC-010. THE CAP IS THE SERVER'S, NOT THE SCREEN'S.
   *
   * `NewGroupScreen` disables its button past the cap, and that is a courtesy.
   * The rule is the server's refusal, and the reason it is a rule rather than a
   * preference is `TransactWriteItems`: it caps at 100 items and a group write
   * is 1 meta + 2N participant rows, so 20 people is 41 and the next size up
   * would not be a bigger group but a silently truncated one.
   *
   * So this never goes near the client. It asks for 25 in one request, and then
   * asks to exceed a full group one person at a time - the two ways past a cap
   * that is only checked in one of them.
   */
  it('N-09 refuses a group over the cap, whichever way it is exceeded (SC-010, FR-031)', async () => {
    const creator = await actor('capRude');

    // Twenty-five in a single create. A cap enforced only on `addParticipant`
    // passes every incremental test and loses six people here.
    const tooMany: string[] = [];
    for (let i = 0; i < 25; i++) tooMany.push((await actor('capRudeMember')).handle);

    const atOnce = await raw(baseUrl(), '/v1/conversations/groups', {
      token: creator.token,
      method: 'POST',
      body: JSON.stringify({ participantHandles: tooMany, name: 'Too Many' }),
    });
    expect([400, 409, 422]).toContain(atOnce.status);

    // And nothing was written. A refusal that half-created the group would be
    // worse than one that created all of it.
    const inbox = await raw(baseUrl(), '/v1/conversations?state=accepted&limit=50', {
      token: creator.token,
    });
    const named = (inbox.body as { items: { name: string | null }[] }).items.filter(
      (c) => c.name === 'Too Many',
    );
    expect(named).toHaveLength(0);

    // Exactly the cap is ALLOWED - 19 others plus the creator - so the refusal
    // above is about the cap and not about groups being refused generally.
    const atCap: string[] = [];
    for (let i = 0; i < 19; i++) atCap.push((await actor('capRudeOk')).handle);
    const full = await raw(baseUrl(), '/v1/conversations/groups', {
      token: creator.token,
      method: 'POST',
      body: JSON.stringify({ participantHandles: atCap, name: 'Exactly Full' }),
    });
    expect(full.status).toBe(201);
    const conversationId = (full.body as { conversationId: string }).conversationId;

    // One more, one at a time, past the client entirely.
    const overflow = await actor('capRudeOverflow');
    const added = await raw(baseUrl(), `/v1/conversations/${conversationId}/participants`, {
      token: creator.token,
      method: 'POST',
      body: JSON.stringify({ handle: overflow.handle }),
    });
    expect([400, 409, 422]).toContain(added.status);

    // And they really are not in it.
    const reread = await raw(baseUrl(), `/v1/conversations/${conversationId}`, {
      token: creator.token,
    });
    const participants = (reread.body as { participants: { person: { handle: string } }[] })
      .participants;
    expect(participants).toHaveLength(20);
    expect(participants.some((p) => p.person.handle === overflow.handle)).toBe(false);
  });

  /**
   * SC-012. TWO REFUSALS THAT MUST BE THE SAME BYTES.
   *
   * FR-023 refuses a group containing a blocking pair. If that refusal is
   * distinguishable from any other "cannot add" refusal, it discloses the block
   * - which is the one thing the whole blocking design withholds, and the same
   * reason 001 makes a blocked post a 404 rather than a 403.
   *
   * "Both are 409" is not the assertion. The bodies are compared LITERALLY,
   * because a title that reads "That person has blocked you" is also a 409.
   */
  it('N-10 the blocked-add refusal is byte-identical to an ordinary cannot-add refusal (SC-012)', async () => {
    const creator = await actor('blockRefusalCreator');
    const member = await actor('blockRefusalMember');
    const filler = await actor('blockRefusalFiller');
    const blocked = await actor('blockRefusalTarget');

    await member.data.people.follow(creator.handle);
    await filler.data.people.follow(creator.handle);

    const group = await creator.data.conversations.createGroup({
      participantHandles: [member.handle, filler.handle],
      name: 'Refusal Comparison',
    });

    // Refusal A: a block exists between a member and the person being added.
    await member.data.safety.block(blocked.handle);
    const blockedAdd = await raw(baseUrl(), `/v1/conversations/${group.conversationId}/participants`, {
      token: creator.token,
      method: 'POST',
      body: JSON.stringify({ handle: blocked.handle }),
    });

    /**
     * Refusal B: NO BLOCK ANYWHERE - the handle simply does not exist.
     *
     * That is the right comparison, and picking it took a wrong one first: the
     * creator's own handle is already a participant, which is an idempotent
     * no-op returning 204 (J-36), not a refusal at all. The pairing that
     * matters is "there is no such person" against "you have been blocked",
     * because those are exactly the two answers an attacker is trying to tell
     * apart.
     */
    const ordinary = await raw(baseUrl(), `/v1/conversations/${group.conversationId}/participants`, {
      token: creator.token,
      method: 'POST',
      body: JSON.stringify({ handle: `nobody-${Date.now()}` }),
    });

    expect(blockedAdd.status).toBe(ordinary.status);
    // The BODIES, literally. Anything that varies between them - a title, a
    // detail, an extension member - is a channel that answers "did they block
    // me?" to anyone willing to try both.
    expect(blockedAdd.text).toBe(ordinary.text);
    // And neither of them names the block.
    expect(blockedAdd.text.toLowerCase()).not.toMatch(/block/);
  });
});
