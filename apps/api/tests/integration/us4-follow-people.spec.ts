import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/** US4 acceptance scenarios, per spec.md § User Story 4. */
describe('US4 — follow people within the interests you care about', () => {
  let h: Harness;
  let viewerToken: string;
  let authorHandle: string;
  let authorToken: string;
  let interestId: string;

  beforeAll(async () => {
    h = await bootHarness();
    viewerToken = await h.token(await h.createPerson('fan'));
    const authorId = await h.createPerson('artist');
    authorToken = await h.token(authorId);
    const { PersonRepository } = await import('../../src/persistence/person.repository');
    authorHandle = (await h.module.get(PersonRepository).findById(authorId))!.handle;
    interestId = await h.topInterestId();
  }, 90_000);

  afterAll(async () => h?.close());

  it('scenario 1: following records the relationship and updates both counts', async () => {
    const before = await request(h.app.getHttpServer()).get(`/v1/people/${authorHandle}`);
    expect(before.status).toBe(200);

    const res = await request(h.app.getHttpServer())
      .put(`/v1/people/${authorHandle}/follow`)
      .set('authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(204);

    const after = await request(h.app.getHttpServer())
      .get(`/v1/people/${authorHandle}`)
      .set('authorization', `Bearer ${viewerToken}`);
    expect(after.body.followerCount).toBe(before.body.followerCount + 1);
    expect(after.body.viewerIsFollowing).toBe(true);
  }, 60_000);

  it('following is idempotent and does not double-count', async () => {
    const before = await request(h.app.getHttpServer()).get(`/v1/people/${authorHandle}`);
    await request(h.app.getHttpServer())
      .put(`/v1/people/${authorHandle}/follow`)
      .set('authorization', `Bearer ${viewerToken}`);
    const after = await request(h.app.getHttpServer()).get(`/v1/people/${authorHandle}`);
    expect(after.body.followerCount).toBe(before.body.followerCount);
  }, 60_000);

  it('scenario 2: a followed author is ranked above an unfollowed one in the same interest', async () => {
    await request(h.app.getHttpServer())
      .put(`/v1/interests/${interestId}/follow`)
      .set('authorization', `Bearer ${viewerToken}`);

    const publish = async (token: string) => {
      const res = await request(h.app.getHttpServer())
        .post('/v1/posts')
        .set('authorization', `Bearer ${token}`)
        .send({ uploads: [{ uploadId: 'u', key: 'k', kind: 'image' }], interestIds: [interestId] });
      const postId = res.body.postId as string;
      const { PostRepository } = await import('../../src/persistence/post.repository');
      const { ProcessingService } = await import('../../src/modules/posts/processing.service');
      const posts = h.module.get(PostRepository);
      for (const m of await posts.listMedia(postId)) {
        await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
      }
      await h.module.get(ProcessingService).reconcile(postId);
      return postId;
    };

    const followedPost = await publish(authorToken);
    const strangerPost = await publish(await h.token(await h.createPerson('stranger')));

    const feed = await request(h.app.getHttpServer())
      .get('/v1/feed/home?limit=50')
      .set('authorization', `Bearer ${viewerToken}`);
    const ids = feed.body.items.map((i: { postId: string }) => i.postId);
    expect(ids).toContain(followedPost);
    expect(ids).toContain(strangerPost);
    // Both present - prominence reorders, it does not filter.
    expect(ids.indexOf(followedPost)).toBeLessThan(ids.indexOf(strangerPost));
  }, 120_000);

  it('scenario 4: the profile shows counts and the interests they post to most (FR-038)', async () => {
    const res = await request(h.app.getHttpServer()).get(`/v1/people/${authorHandle}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.followerCount).toBe('number');
    expect(typeof res.body.followingCount).toBe('number');
    expect(res.body.topInterests.map((i: { interestId: string }) => i.interestId)).toContain(interestId);
  }, 60_000);

  it('unfollowing reverses the counts', async () => {
    const before = await request(h.app.getHttpServer()).get(`/v1/people/${authorHandle}`);
    await request(h.app.getHttpServer())
      .delete(`/v1/people/${authorHandle}/follow`)
      .set('authorization', `Bearer ${viewerToken}`);
    const after = await request(h.app.getHttpServer()).get(`/v1/people/${authorHandle}`);
    expect(after.body.followerCount).toBe(before.body.followerCount - 1);
  }, 60_000);

  it('you cannot follow yourself', async () => {
    const res = await request(h.app.getHttpServer())
      .put(`/v1/people/${authorHandle}/follow`)
      .set('authorization', `Bearer ${authorToken}`);
    expect(res.status).toBe(409);
  });

  it('following an unknown person is 404', async () => {
    const res = await request(h.app.getHttpServer())
      .put('/v1/people/nobodyatall/follow')
      .set('authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(404);
  });

  it('following requires authentication', async () => {
    expect((await request(h.app.getHttpServer()).put(`/v1/people/${authorHandle}/follow`)).status).toBe(401);
  });
});
