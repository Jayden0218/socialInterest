import request from 'supertest';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';
import { bootHarness, type Harness } from './harness';

/**
 * 008/T178, US13 — matrix surface 17, FR-044.
 *
 * A SAVE IS A BOOKMARK, NOT A COPY, and this is the case that proves it.
 *
 * The saved list is the surface where "I already had access" is most tempting to
 * honour: the person did save it, the row is in their own partition, and the
 * post is right there. Every one of those is true and none of them is a reason —
 * the boundary decides on every read, so a post saved while its author was open
 * stops being readable the moment they go private, exactly as it does everywhere
 * else. FR-045 protects FOLLOWERS, not bookmarks.
 *
 * This is also the surface a matrix organised by surface alone would miss: the
 * saved list existed before 008 and its rows only change once privacy does.
 */
describe('008/US13 a post saved before its author went private stops being readable', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

  it('surface 17 the saved list drops it, and the row itself is not deleted', async () => {
    const authorToken = await h.token(await h.createPerson('savedPrivAuthor'));
    const readerToken = await h.token(await h.createPerson('savedPrivReader'));

    const created = await request(server())
      .post('/v1/posts')
      .set('authorization', `Bearer ${authorToken}`)
      .send({
        uploadIds: [await h.uploadId(authorToken)],
        interestIds: [await h.topInterestId()],
        caption: 'saved while the account was open',
        visibility: 'public',
      });
    expect({ step: 'publish', status: created.status }).toEqual({ step: 'publish', status: 201 });
    const postId = created.body.postId as string;
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);

    const saved = await request(server())
      .put(`/v1/posts/${postId}/save`)
      .set('authorization', `Bearer ${readerToken}`);
    expect({ step: 'save', status: saved.status }).toEqual({ step: 'save', status: 204 });

    const listBefore = await request(server())
      .get('/v1/me/saved')
      .set('authorization', `Bearer ${readerToken}`);
    expect(listBefore.body.items.map((p: { postId: string }) => p.postId)).toContain(postId);

    await request(server())
      .patch('/v1/me')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ accountPrivacy: 'private' });

    const listAfter = await request(server())
      .get('/v1/me/saved')
      .set('authorization', `Bearer ${readerToken}`);
    expect(listAfter.body.items.map((p: { postId: string }) => p.postId)).not.toContain(postId);

    // And the post detail agrees. Two surfaces disagreeing about one post is the
    // shape of a second predicate, which is what Principle II forbids.
    const detail = await request(server())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${readerToken}`);
    expect(detail.status).toBe(403);

    /**
     * THE SAVE ROW SURVIVES, and that is deliberate. Nothing deleted it — the
     * boundary simply stopped returning the post — so if the author goes open
     * again the bookmark is still there. A read filter that quietly destroyed
     * the reader's own data would be a much worse failure than a hidden post.
     */
    await request(server())
      .patch('/v1/me')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ accountPrivacy: 'open' });
    const listRestored = await request(server())
      .get('/v1/me/saved')
      .set('authorization', `Bearer ${readerToken}`);
    expect(listRestored.body.items.map((p: { postId: string }) => p.postId)).toContain(postId);
  }, 60_000);
});
