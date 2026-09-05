import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * FR-017 — THE REQUIREMENT THAT SHAPED THE WHOLE FEED DESIGN.
 *
 * "A visibility change MUST take effect on every surface immediately."
 *
 * That sentence is why research D1 chose read-time feed assembly over
 * fan-out-on-write, and why post writes are transactional across the post item
 * and every denormalised index item. If this test can be made to fail by any
 * future optimisation - a materialised timeline, a cached listing, a
 * denormalised copy that updates separately - that optimisation is forbidden.
 */
describe('FR-017 — a public→private flip removes the post from every surface at once', () => {
  let h: Harness;
  let authorToken: string;
  let authorHandle: string;
  let viewerToken: string;
  let interestId: string;
  let postId: string;

  beforeAll(async () => {
    h = await bootHarness();
    const authorId = await h.createPerson('flipper');
    authorToken = await h.token(authorId);
    const { PersonRepository } = await import('../../src/persistence/person.repository');
    authorHandle = (await h.module.get(PersonRepository).findById(authorId))!.handle;

    viewerToken = await h.token(await h.createPerson('watcher'));
    interestId = await h.topInterestId();

    const created = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ uploads: [{ uploadId: 'u', key: 'k', kind: 'image' }], interestIds: [interestId] });
    postId = created.body.postId;

    const { PostRepository } = await import('../../src/persistence/post.repository');
    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);

    await request(h.app.getHttpServer())
      .put(`/v1/interests/${interestId}/follow`)
      .set('authorization', `Bearer ${viewerToken}`);
  }, 120_000);

  afterAll(async () => h?.close());

  /** Every surface FR-018 enumerates that can currently carry a post. */
  const surfaces = async (token?: string) => {
    const auth = (r: request.Test) => (token ? r.set('authorization', `Bearer ${token}`) : r);
    const [interest, profile, feed, direct, comments] = await Promise.all([
      auth(request(h.app.getHttpServer()).get(`/v1/interests/${interestId}/posts?limit=50`)),
      auth(request(h.app.getHttpServer()).get(`/v1/people/${authorHandle}/posts?limit=50`)),
      token
        ? request(h.app.getHttpServer()).get('/v1/feed/home?limit=50').set('authorization', `Bearer ${token}`)
        : Promise.resolve({ body: { items: [] } } as unknown as request.Response),
      auth(request(h.app.getHttpServer()).get(`/v1/posts/${postId}`)),
      auth(request(h.app.getHttpServer()).get(`/v1/posts/${postId}/comments`)),
    ]);
    const has = (r: { body: { items?: { postId: string }[] } }) =>
      (r.body.items ?? []).some((i) => i.postId === postId);
    return {
      interestSpace: has(interest),
      profile: has(profile),
      homeFeed: has(feed as { body: { items?: { postId: string }[] } }),
      shareLink: direct.status,
      comments: comments.status,
    };
  };

  it('is present on every surface while public', async () => {
    const seen = await surfaces(viewerToken);
    expect(seen.interestSpace).toBe(true);
    expect(seen.profile).toBe(true);
    expect(seen.homeFeed).toBe(true);
    expect(seen.shareLink).toBe(200);
    expect(seen.comments).toBe(200);
  }, 60_000);

  it('vanishes from ALL of them on the very next read after the flip', async () => {
    const flip = await request(h.app.getHttpServer())
      .patch(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${authorToken}`)
      .send({ visibility: 'private' });
    expect(flip.status).toBe(200);
    expect(flip.body.visibility).toBe('private');

    // No waiting, no cache expiry, no background job: the next read.
    const seen = await surfaces(viewerToken);
    expect(seen.interestSpace).toBe(false);
    expect(seen.profile).toBe(false);
    expect(seen.homeFeed).toBe(false);
    // FR-042: the outstanding share link stops resolving.
    expect(seen.shareLink).toBe(403);
    expect(seen.comments).toBe(403);
  }, 60_000);

  it('is also gone for a signed-out viewer', async () => {
    const seen = await surfaces();
    expect(seen.interestSpace).toBe(false);
    expect(seen.profile).toBe(false);
    expect(seen.shareLink).toBe(403);
  }, 60_000);

  it('the author still sees their own private post', async () => {
    const seen = await surfaces(authorToken);
    expect(seen.shareLink).toBe(200);
    expect(seen.profile).toBe(true);
  }, 60_000);

  it('widening back to public restores it everywhere, just as immediately', async () => {
    await request(h.app.getHttpServer())
      .patch(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${authorToken}`)
      .send({ visibility: 'public' });

    const seen = await surfaces(viewerToken);
    expect(seen.interestSpace).toBe(true);
    expect(seen.homeFeed).toBe(true);
    expect(seen.shareLink).toBe(200);
  }, 60_000);
});
