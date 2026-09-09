import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';

/**
 * 008/T120, US8 — FR-027, FR-028. CORRECT OR WITHDRAW WHAT YOU SAID.
 *
 * The count is the part worth testing hardest. `incrementCommentCount` is a
 * READ-MODIFY-WRITE and says so in its own repository comment, so a delete that
 * decremented separately from the row it removes can leave the number and the
 * rows disagreeing — the exact defect 005/R5 made the rating aggregate
 * transactional to prevent.
 *
 * So the assertion is not "the count went down". It is that the count MATCHES
 * THE ROWS after the operation, which is the only form that catches a drift.
 */
describe('008/US8 editing and deleting your own comment', () => {
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

  const comment = async (token: string, postId: string, body: string): Promise<string> => {
    const res = await request(server())
      .post(`/v1/posts/${postId}/comments`)
      .set('authorization', `Bearer ${token}`)
      .send({ body });
    expect({ step: 'comment', status: res.status }).toEqual({ step: 'comment', status: 201 });
    return res.body.commentId as string;
  };

  it('FR-027 an edit changes the body and MARKS it edited', async () => {
    const person = await h.createPerson('editAuthor');
    const token = await h.token(person);
    const postId = await publishReady(token, 'a post to be commented on');
    const commentId = await comment(token, postId, 'the first wording');

    const edited = await request(server())
      .patch(`/v1/posts/${postId}/comments/${commentId}`)
      .set('authorization', `Bearer ${token}`)
      .send({ body: 'the better wording' });
    expect(edited.status).toBe(200);

    const list = await request(server())
      .get(`/v1/posts/${postId}/comments`)
      .set('authorization', `Bearer ${token}`);
    const found = list.body.items.find((c: { commentId: string }) => c.commentId === commentId);
    /**
     * FR-027's "marked as edited" IS the presence of `editedAt` — not a
     * separate boolean that could one day disagree with it.
     */
    expect({ body: found.body, edited: typeof found.editedAt === 'string' }).toEqual({
      body: 'the better wording',
      edited: true,
    });
  }, 120_000);

  it('FR-028 a delete removes the row AND leaves the count matching the rows', async () => {
    const person = await h.createPerson('deleteAuthor');
    const token = await h.token(person);
    const postId = await publishReady(token, 'a post with two comments');
    const first = await comment(token, postId, 'the one that stays');
    const second = await comment(token, postId, 'the one to withdraw');

    const before = await request(server()).get(`/v1/posts/${postId}`).set('authorization', `Bearer ${token}`);
    expect(before.body.commentCount).toBe(2);

    const deleted = await request(server())
      .delete(`/v1/posts/${postId}/comments/${second}`)
      .set('authorization', `Bearer ${token}`);
    expect(deleted.status).toBe(204);

    const list = await request(server())
      .get(`/v1/posts/${postId}/comments`)
      .set('authorization', `Bearer ${token}`);
    const post = await request(server()).get(`/v1/posts/${postId}`).set('authorization', `Bearer ${token}`);

    // The count and the rows it counts, compared to each other. A count read on
    // its own would pass while drifting.
    expect({
      rows: list.body.items.map((c: { commentId: string }) => c.commentId),
      count: post.body.commentCount,
    }).toEqual({ rows: [first], count: 1 });
  }, 120_000);

  it('deleting twice does not take the count below the rows', async () => {
    const person = await h.createPerson('doubleDelete');
    const token = await h.token(person);
    const postId = await publishReady(token, 'a post with one comment');
    const only = await comment(token, postId, 'about to go');

    const first = await request(server())
      .delete(`/v1/posts/${postId}/comments/${only}`)
      .set('authorization', `Bearer ${token}`);
    expect(first.status).toBe(204);
    const again = await request(server())
      .delete(`/v1/posts/${postId}/comments/${only}`)
      .set('authorization', `Bearer ${token}`);
    // Gone is gone. A second delete that decremented again would produce a
    // negative count, which is how a count and its rows part company for good.
    expect(again.status).toBe(404);

    const post = await request(server()).get(`/v1/posts/${postId}`).set('authorization', `Bearer ${token}`);
    expect(post.body.commentCount).toBe(0);
  }, 120_000);
});
