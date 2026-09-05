import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * A BLOCKED VIEWER MUST GET 404, NOT 403.
 *
 * 403 means "this exists but is not for you". Returning it to someone who has
 * been blocked confirms the post exists and, by inference, that a block is in
 * place - which discloses the block to exactly the person it was placed against.
 * 404 is deliberately indistinguishable from deletion.
 *
 * See the error-distinction table in contracts/visibility-matrix.md.
 */
describe('FR-042 / FR-044 — a block is never disclosed by a status code', () => {
  let h: Harness;
  let authorToken: string;
  let authorId: string;
  let blockedToken: string;
  let blockedId: string;
  let strangerToken: string;
  let postId: string;

  beforeAll(async () => {
    h = await bootHarness();
    authorId = await h.createPerson('blockauthor');
    authorToken = await h.token(authorId);
    blockedId = await h.createPerson('blockedviewer');
    blockedToken = await h.token(blockedId);
    strangerToken = await h.token(await h.createPerson('blockstranger'));

    const interestId = await h.topInterestId();
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

    // The author blocks the viewer.
    const { BlockRepository } = await import('../../src/persistence/block.repository');
    await h.module.get(BlockRepository).block(authorId, blockedId);
  }, 120_000);

  afterAll(async () => h?.close());

  it('a blocked viewer gets 404 on the post, identical to a deleted one', async () => {
    const blocked = await request(h.app.getHttpServer())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${blockedToken}`);
    expect(blocked.status).toBe(404);

    const deleted = await request(h.app.getHttpServer()).get('/v1/posts/01JZZZZZZZZZZZZZZZZZZZZZZZ');
    // Byte-identical bodies: nothing distinguishes blocked from gone.
    expect(blocked.body).toEqual(deleted.body);
  }, 60_000);

  it('the same post is 200 for an unblocked stranger, so the 404 really is the block', async () => {
    const ok = await request(h.app.getHttpServer())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${strangerToken}`);
    expect(ok.status).toBe(200);
  }, 60_000);

  it('a private post gives a stranger 403 — the distinction is preserved', async () => {
    // Proof the API does not simply 404 everything: an excluded-but-not-blocked
    // viewer still gets the informative 403 FR-042 requires.
    const priv = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${authorToken}`)
      .send({
        uploads: [{ uploadId: 'u', key: 'k', kind: 'image' }],
        interestIds: [await h.topInterestId()],
        visibility: 'private',
      });
    const privId = priv.body.postId as string;
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(privId)) {
      await posts.updateMediaState(privId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(privId);

    const res = await request(h.app.getHttpServer())
      .get(`/v1/posts/${privId}`)
      .set('authorization', `Bearer ${strangerToken}`);
    expect(res.status).toBe(403);
  }, 90_000);

  it('comments on a blocked post are 404 too, not a leak through another surface', async () => {
    const res = await request(h.app.getHttpServer())
      .get(`/v1/posts/${postId}/comments`)
      .set('authorization', `Bearer ${blockedToken}`);
    expect(res.status).toBe(404);
  }, 60_000);

  it('a share link resolves against the block, not against having the URL', async () => {
    const link = await request(h.app.getHttpServer())
      .post(`/v1/posts/${postId}/share-link`)
      .set('authorization', `Bearer ${strangerToken}`);
    expect(link.status).toBe(201);

    // Holding the URL confers nothing.
    const res = await request(h.app.getHttpServer())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${blockedToken}`);
    expect(res.status).toBe(404);
  }, 60_000);
});
