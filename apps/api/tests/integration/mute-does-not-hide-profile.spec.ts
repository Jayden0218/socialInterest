import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';

/**
 * 008/T158, US12 — SC-013. THE LOAD-BEARING TEST OF THE WHOLE FEATURE.
 *
 * `contracts/selection-vs-boundary.md` says mute is SELECTION, not the boundary,
 * and this is the behavioural half of that claim: the muted person's posts are
 * absent from the surfaces that SELECT, and present everywhere a viewer went
 * looking on purpose.
 *
 * A muted person's profile is NOT EMPTY. That is the observable difference
 * between the two sides, and if mute were implemented in `VisibilityFilter` this
 * test would fail on exactly that assertion — which is why it is written before
 * the implementation and asserts both halves in one place.
 */
describe('008/US12 mute selects, and never hides', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

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

  it('SC-013 absent from Following and search, PRESENT on the profile and the direct read', async () => {
    const noisy = await h.createPerson('mutedAuthor');
    const viewer = await h.createPerson('mutingViewer');
    const noisyToken = await h.token(noisy);
    const viewerToken = await h.token(viewer);
    const noisyHandle = (await request(server()).get('/v1/me').set('authorization', `Bearer ${noisyToken}`)).body
      .handle as string;

    const word = `quokka${Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6)}`;
    const postId = await publishReady(noisyToken, `a post about a ${word}`);

    const followed = await request(server())
      .put(`/v1/people/${noisyHandle}/follow`)
      .set('authorization', `Bearer ${viewerToken}`);
    expect({ step: 'follow', status: followed.status }).toEqual({ step: 'follow', status: 204 });

    const muted = await request(server())
      .put(`/v1/people/${noisyHandle}/mute`)
      .set('authorization', `Bearer ${viewerToken}`);
    expect({ step: 'mute', status: muted.status }).toEqual({ step: 'mute', status: 204 });

    const following = await request(server())
      .get('/v1/feed/following?limit=50')
      .set('authorization', `Bearer ${viewerToken}`);
    const searched = await request(server())
      .get(`/v1/search/posts?q=${word}`)
      .set('authorization', `Bearer ${viewerToken}`);
    const profile = await request(server())
      .get(`/v1/people/${noisyHandle}/posts?limit=50`)
      .set('authorization', `Bearer ${viewerToken}`);
    const direct = await request(server())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${viewerToken}`);
    const stillFollowing = await request(server())
      .get(`/v1/people/${noisyHandle}`)
      .set('authorization', `Bearer ${viewerToken}`);

    expect({
      inFollowing: following.body.items.some((p: { postId: string }) => p.postId === postId),
      inSearch: searched.body.items.some((p: { postId: string }) => p.postId === postId),
      // THE HALF THAT SEPARATES THE TWO SIDES. A muted person's profile is not
      // empty: mute means "do not select", not "may not see".
      onProfile: profile.body.items.some((p: { postId: string }) => p.postId === postId),
      directRead: direct.status,
      // FR-039: the follow survives. Muting is not a quieter unfollow.
      followSurvives: stillFollowing.body.viewerIsFollowing,
    }).toEqual({
      inFollowing: false,
      inSearch: false,
      onProfile: true,
      directRead: 200,
      followSurvives: true,
    });
  }, 180_000);

  it('unmuting restores it to the selecting surfaces', async () => {
    const noisy = await h.createPerson('unmutedAuthor');
    const viewer = await h.createPerson('unmutingViewer');
    const noisyToken = await h.token(noisy);
    const viewerToken = await h.token(viewer);
    const noisyHandle = (await request(server()).get('/v1/me').set('authorization', `Bearer ${noisyToken}`)).body
      .handle as string;

    const postId = await publishReady(noisyToken, 'a post to be muted and unmuted');
    await request(server()).put(`/v1/people/${noisyHandle}/follow`).set('authorization', `Bearer ${viewerToken}`);
    await request(server()).put(`/v1/people/${noisyHandle}/mute`).set('authorization', `Bearer ${viewerToken}`);
    const un = await request(server())
      .delete(`/v1/people/${noisyHandle}/mute`)
      .set('authorization', `Bearer ${viewerToken}`);
    expect(un.status).toBe(204);

    const following = await request(server())
      .get('/v1/feed/following?limit=50')
      .set('authorization', `Bearer ${viewerToken}`);
    expect(following.body.items.some((p: { postId: string }) => p.postId === postId)).toBe(true);
  }, 180_000);
});
