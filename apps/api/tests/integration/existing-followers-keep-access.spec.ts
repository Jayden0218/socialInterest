import request from 'supertest';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';
import { bootHarness, type Harness } from './harness';

/**
 * 008/T177, US13 — FR-045. GOING PRIVATE DOES NOT EVICT THE PEOPLE ALREADY THERE.
 *
 * The tempting implementation of "private" converts existing followers into
 * pending requests, so the author can review who is already in. It is wrong, and
 * expensively so: it silently removes access somebody already had, at a moment
 * when the author is trying to REDUCE exposure and is least likely to notice a
 * feature doing something else.
 *
 * The design makes it free rather than careful — privacy is one clause at the
 * boundary and touches no follow row — but "it cannot happen by construction" is
 * a claim, and this is where it is measured. The suite also covers the third
 * state the boolean cannot express: a PENDING follower is not a follower.
 */
describe('008/US13 existing followers keep access when an account goes private', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

  const handleOf = async (token: string): Promise<string> =>
    (await request(server()).get('/v1/me').set('authorization', `Bearer ${token}`)).body
      .handle as string;

  const publishReady = async (token: string, caption: string): Promise<string> => {
    const created = await request(server())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({
        uploadIds: [await h.uploadId(token)],
        interestIds: [await h.topInterestId()],
        caption,
        visibility: 'public',
      });
    expect({ step: 'publish', status: created.status }).toEqual({ step: 'publish', status: 201 });
    const postId = created.body.postId as string;
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);
    return postId;
  };

  it('FR-045 a follower from before the flip still reads the post afterwards', async () => {
    const authorToken = await h.token(await h.createPerson('keepAccessAuthor'));
    const followerToken = await h.token(await h.createPerson('keepAccessFollower'));
    const authorHandle = await handleOf(authorToken);

    const followed = await request(server())
      .put(`/v1/people/${authorHandle}/follow`)
      .set('authorization', `Bearer ${followerToken}`);
    // An unchecked setup call is how a test fails somewhere other than where it
    // broke — three failures in `following-feed.spec.ts` were exactly that.
    expect({ step: 'follow', status: followed.status }).toEqual({ step: 'follow', status: 204 });

    const postId = await publishReady(authorToken, 'still yours to read');

    await request(server())
      .patch('/v1/me')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ accountPrivacy: 'private' });

    const read = await request(server())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${followerToken}`);
    expect({ status: read.status, postId: read.body.postId }).toEqual({ status: 200, postId });

    // And the follow row itself is untouched: not converted, not re-requested.
    const profile = await request(server())
      .get(`/v1/people/${authorHandle}`)
      .set('authorization', `Bearer ${followerToken}`);
    expect({
      following: profile.body.viewerIsFollowing,
      state: profile.body.viewerFollowState,
    }).toEqual({ following: true, state: 'following' });
  }, 60_000);

  it('FR-043 a request made AFTER the flip grants nothing until it is approved', async () => {
    const authorToken = await h.token(await h.createPerson('gatedAuthor'));
    const askerToken = await h.token(await h.createPerson('gatedAsker'));
    const authorHandle = await handleOf(authorToken);
    const askerHandle = await handleOf(askerToken);

    await request(server())
      .patch('/v1/me')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ accountPrivacy: 'private' });

    const postId = await publishReady(authorToken, 'behind the gate');

    const asked = await request(server())
      .put(`/v1/people/${authorHandle}/follow`)
      .set('authorization', `Bearer ${askerToken}`);
    expect({ step: 'request', status: asked.status }).toEqual({ step: 'request', status: 204 });

    const pendingProfile = await request(server())
      .get(`/v1/people/${authorHandle}`)
      .set('authorization', `Bearer ${askerToken}`);
    /**
     * THE TRAP THIS TEST EXISTS FOR: a follow ROW exists, and treating its
     * existence as a follow would make the request pointless — the content would
     * be readable while the author was still deciding.
     */
    expect({
      following: pendingProfile.body.viewerIsFollowing,
      state: pendingProfile.body.viewerFollowState,
    }).toEqual({ following: false, state: 'pending' });

    const blocked = await request(server())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${askerToken}`);
    // `not_for_you` (403), not `gone` (404): a private account is a stated fact
    // on the profile, so the error may say so. Only a block must be indistinct.
    expect(blocked.status).toBe(403);

    // The author sees the request, approves it, and only then does it grant.
    const list = await request(server())
      .get('/v1/me/follow-requests')
      .set('authorization', `Bearer ${authorToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items.map((p: { handle: string }) => p.handle)).toContain(askerHandle);

    const approved = await request(server())
      .put(`/v1/me/follow-requests/${askerHandle}`)
      .set('authorization', `Bearer ${authorToken}`);
    expect({ step: 'approve', status: approved.status }).toEqual({ step: 'approve', status: 204 });

    const allowed = await request(server())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${askerToken}`);
    expect({ status: allowed.status, postId: allowed.body.postId }).toEqual({ status: 200, postId });

    // Approving is what moves the counter, so the count and what the boundary
    // grants are the same fact. Requesting moved nothing.
    const after = await request(server()).get('/v1/me').set('authorization', `Bearer ${authorToken}`);
    expect({ followers: after.body.followerCount, pending: after.body.pendingFollowRequests }).toEqual({
      followers: 1,
      pending: 0,
    });
  }, 60_000);

  it('FR-043 declining removes the request and grants nothing', async () => {
    const authorToken = await h.token(await h.createPerson('decliningAuthor'));
    const askerToken = await h.token(await h.createPerson('decliningAsker'));
    const authorHandle = await handleOf(authorToken);
    const askerHandle = await handleOf(askerToken);

    await request(server())
      .patch('/v1/me')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ accountPrivacy: 'private' });
    await request(server())
      .put(`/v1/people/${authorHandle}/follow`)
      .set('authorization', `Bearer ${askerToken}`);

    const declined = await request(server())
      .delete(`/v1/me/follow-requests/${askerHandle}`)
      .set('authorization', `Bearer ${authorToken}`);
    expect({ step: 'decline', status: declined.status }).toEqual({ step: 'decline', status: 204 });

    const after = await request(server()).get('/v1/me').set('authorization', `Bearer ${authorToken}`);
    expect({ followers: after.body.followerCount, pending: after.body.pendingFollowRequests }).toEqual({
      followers: 0,
      pending: 0,
    });

    /**
     * A declined request may be sent again. Storing a `declined` state would be
     * a third value nothing reads that also silently blocks a change of mind —
     * 004/FR-006's "do not persist a state whose only job is to describe the
     * past", in a new place.
     */
    const again = await request(server())
      .put(`/v1/people/${authorHandle}/follow`)
      .set('authorization', `Bearer ${askerToken}`);
    expect(again.status).toBe(204);
    const listed = await request(server())
      .get('/v1/me/follow-requests')
      .set('authorization', `Bearer ${authorToken}`);
    expect(listed.body.items.map((p: { handle: string }) => p.handle)).toContain(askerHandle);
  }, 60_000);
});
