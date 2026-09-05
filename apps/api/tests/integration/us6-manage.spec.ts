import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/** US6 acceptance scenarios, per spec.md § User Story 6. */
describe('US6 — manage your profile and your content', () => {
  let h: Harness;
  let authorToken: string;
  let authorHandle: string;
  let otherToken: string;
  let interestId: string;
  let otherInterestId: string;

  const ready = async (postId: string) => {
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);
  };

  const publish = async () => {
    const res = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ uploadIds: [await h.uploadId(authorToken)], interestIds: [interestId], caption: 'before' });
    await ready(res.body.postId);
    return res.body.postId as string;
  };

  beforeAll(async () => {
    h = await bootHarness();
    const authorId = await h.createPerson('manager');
    authorToken = await h.token(authorId);
    const { PersonRepository } = await import('../../src/persistence/person.repository');
    authorHandle = (await h.module.get(PersonRepository).findById(authorId))!.handle;
    otherToken = await h.token(await h.createPerson('intruder'));
    interestId = await h.topInterestId();
    const tops = await request(h.app.getHttpServer()).get('/v1/interests?level=top&limit=50');
    otherInterestId = tops.body.items.find((i: { interestId: string }) => i.interestId !== interestId).interestId;
  }, 90_000);

  afterAll(async () => h?.close());

  it('scenario 1a: editing a caption is reflected wherever the post appears', async () => {
    const postId = await publish();
    const res = await request(h.app.getHttpServer())
      .patch(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${authorToken}`)
      .send({ caption: 'after' });
    expect(res.status).toBe(200);
    expect(res.body.caption).toBe('after');

    const fetched = await request(h.app.getHttpServer()).get(`/v1/posts/${postId}`);
    expect(fetched.body.caption).toBe('after');
  }, 90_000);

  it('scenario 1b: re-filing moves the post between interest spaces atomically', async () => {
    const postId = await publish();
    const res = await request(h.app.getHttpServer())
      .patch(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${authorToken}`)
      .send({ interestIds: [otherInterestId] });
    expect(res.status).toBe(200);

    const from = await request(h.app.getHttpServer()).get(`/v1/interests/${interestId}/posts?limit=50`);
    const to = await request(h.app.getHttpServer()).get(`/v1/interests/${otherInterestId}/posts?limit=50`);
    // Never in both, never in neither.
    expect(from.body.items.map((i: { postId: string }) => i.postId)).not.toContain(postId);
    expect(to.body.items.map((i: { postId: string }) => i.postId)).toContain(postId);
  }, 90_000);

  it('a post cannot be left with no interest, on edit as on create (FR-006)', async () => {
    const postId = await publish();
    const res = await request(h.app.getHttpServer())
      .patch(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${authorToken}`)
      .send({ interestIds: [] });
    expect(res.status).toBe(422);
  }, 90_000);

  it('scenario 3: deleting removes the post from every surface (FR-012)', async () => {
    const postId = await publish();
    const del = await request(h.app.getHttpServer())
      .delete(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${authorToken}`);
    expect(del.status).toBe(204);

    const space = await request(h.app.getHttpServer()).get(`/v1/interests/${interestId}/posts?limit=50`);
    const profile = await request(h.app.getHttpServer()).get(`/v1/people/${authorHandle}/posts?limit=50`);
    expect(space.body.items.map((i: { postId: string }) => i.postId)).not.toContain(postId);
    expect(profile.body.items.map((i: { postId: string }) => i.postId)).not.toContain(postId);
    // Gone for the author too - FR-012 is a delete, not a hide.
    const asAuthor = await request(h.app.getHttpServer())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${authorToken}`);
    expect(asAuthor.status).toBe(404);
  }, 90_000);

  it('only the author may edit or delete', async () => {
    const postId = await publish();
    expect(
      (await request(h.app.getHttpServer())
        .patch(`/v1/posts/${postId}`)
        .set('authorization', `Bearer ${otherToken}`)
        .send({ caption: 'hijacked' })).status,
    ).toBe(403);
    expect(
      (await request(h.app.getHttpServer())
        .delete(`/v1/posts/${postId}`)
        .set('authorization', `Bearer ${otherToken}`)).status,
    ).toBe(403);
  }, 90_000);

  it('profile and notification preferences round-trip (FR-002, FR-049)', async () => {
    const patched = await request(h.app.getHttpServer())
      .patch('/v1/me')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ displayName: 'Renamed', bio: 'hello', notificationPrefs: { reaction: false } });
    expect(patched.status).toBe(200);
    expect(patched.body.displayName).toBe('Renamed');
    expect(patched.body.notificationPrefs.reaction).toBe(false);
    // Merged, not replaced: untouched categories keep their value.
    expect(patched.body.notificationPrefs.comment).toBe(true);
  }, 60_000);

  it('an empty patch is refused rather than silently doing nothing', async () => {
    const res = await request(h.app.getHttpServer())
      .patch('/v1/me')
      .set('authorization', `Bearer ${authorToken}`)
      .send({});
    expect(res.status).toBe(422);
  });
});
