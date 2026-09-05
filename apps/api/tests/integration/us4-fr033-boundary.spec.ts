import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * THE GUARD AGAINST THIS BECOMING AN ORDINARY FOLLOWER FEED.
 *
 * FR-033 admits a followed person's posts ONLY inside interests the viewer also
 * follows. Constitution principle I calls the failure mode out: it is silent. A
 * ranking tweak or a "show me more from people I follow" convenience turns the
 * product into a follower feed and the interest structure becomes decoration,
 * and nobody notices until it is load-bearing.
 *
 * Setup: B posts to interest X and interest Y. A follows B, and follows only X.
 */
describe('FR-033 — a person-follow must not widen the feed', () => {
  let h: Harness;
  let viewerToken: string;
  let authorHandle: string;
  let authorToken: string;
  let followedInterest: string;
  let unfollowedInterest: string;

  beforeAll(async () => {
    h = await bootHarness();
    viewerToken = await h.token(await h.createPerson('viewer'));

    const authorId = await h.createPerson('creator');
    authorToken = await h.token(authorId);
    const { PersonRepository } = await import('../../src/persistence/person.repository');
    authorHandle = (await h.module.get(PersonRepository).findById(authorId))!.handle;

    followedInterest = await h.topInterestId();
    const tops = await request(h.app.getHttpServer()).get('/v1/interests?level=top&limit=50');
    unfollowedInterest = tops.body.items.find(
      (i: { interestId: string }) => i.interestId !== followedInterest,
    ).interestId;
  }, 90_000);

  afterAll(async () => h?.close());

  const publishAs = async (token: string, interestId: string) => {
    const res = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({ uploads: [{ uploadId: 'u', key: 'k', kind: 'image' }], interestIds: [interestId] });
    expect(res.status).toBe(201);
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

  it('a followed person’s post in an UNFOLLOWED interest never reaches the feed', async () => {
    const inFollowed = await publishAs(authorToken, followedInterest);
    const inUnfollowed = await publishAs(authorToken, unfollowedInterest);

    await request(h.app.getHttpServer())
      .put(`/v1/interests/${followedInterest}/follow`)
      .set('authorization', `Bearer ${viewerToken}`);
    await request(h.app.getHttpServer())
      .put(`/v1/people/${authorHandle}/follow`)
      .set('authorization', `Bearer ${viewerToken}`);

    const feed = await request(h.app.getHttpServer())
      .get('/v1/feed/home?limit=50')
      .set('authorization', `Bearer ${viewerToken}`);
    const ids = feed.body.items.map((i: { postId: string }) => i.postId);

    expect(ids).toContain(inFollowed);
    // THE ASSERTION. If this ever passes, the interest focus is gone.
    expect(ids).not.toContain(inUnfollowed);
  }, 120_000);

  it('following the person does not change how many interests the feed reads', async () => {
    // Membership is derived from followed INTERESTS alone. If following a person
    // widened the fan-in, the feed would be reading partitions the viewer never
    // chose - the same failure, visible from the other side.
    const before = (await request(h.app.getHttpServer())
      .get('/v1/feed/home')
      .set('authorization', `Bearer ${viewerToken}`)).body.meta.fanOutWidth;

    const another = await h.createPerson('another');
    const { PersonRepository } = await import('../../src/persistence/person.repository');
    const handle = (await h.module.get(PersonRepository).findById(another))!.handle;
    await request(h.app.getHttpServer())
      .put(`/v1/people/${handle}/follow`)
      .set('authorization', `Bearer ${viewerToken}`);

    const after = (await request(h.app.getHttpServer())
      .get('/v1/feed/home')
      .set('authorization', `Bearer ${viewerToken}`)).body.meta.fanOutWidth;
    expect(after).toBe(before);
  }, 90_000);

  it('unfollowing the interest removes the post even while the person stays followed', async () => {
    await request(h.app.getHttpServer())
      .delete(`/v1/interests/${followedInterest}/follow`)
      .set('authorization', `Bearer ${viewerToken}`);

    const feed = await request(h.app.getHttpServer())
      .get('/v1/feed/home')
      .set('authorization', `Bearer ${viewerToken}`);
    expect(feed.body.items).toEqual([]);
    // Still following the person, and the feed is empty: interests decide
    // membership, people do not.
    expect(feed.body.page.emptyStateHint).toBe('no_followed_interests');
  }, 60_000);
});
