import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';

/**
 * 008/T108, US7 — SC-010. A REPLY DISPLAYS WITH THE THING IT REPLIES TO.
 *
 * Comments have been a flat list since 001, so a reply to somebody four
 * comments up read as a non-sequitur. This is the display promise, and it is
 * asserted on the RESPONSE rather than on the stored rows: the graph stays
 * truthful (research R7) and the LISTING is what has to group.
 *
 * Written before `parentCommentId` exists.
 */
describe('008/US7 replies group with their parent', () => {
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

  /** Asserts its own 201, because an unchecked setup call is how a test fails
   *  somewhere other than where it broke (008/US3 cost three tests to that). */
  const comment = async (
    token: string,
    postId: string,
    body: string,
    parentCommentId?: string,
  ): Promise<string> => {
    const res = await request(server())
      .post(`/v1/posts/${postId}/comments`)
      .set('authorization', `Bearer ${token}`)
      .send({ body, ...(parentCommentId ? { parentCommentId } : {}) });
    expect({ step: 'comment', status: res.status, body: res.body }).toEqual({
      step: 'comment',
      status: 201,
      body: res.body,
    });
    return res.body.commentId as string;
  };

  const list = async (postId: string, token: string) =>
    request(server()).get(`/v1/posts/${postId}/comments`).set('authorization', `Bearer ${token}`);

  it('FR-024 orders parent-then-replies-by-time, and says which parent', async () => {
    const author = await h.createPerson('replyAuthor');
    const talker = await h.createPerson('replyTalker');
    const authorToken = await h.token(author);
    const talkerToken = await h.token(talker);
    const postId = await publishReady(authorToken, 'a post worth discussing');

    const first = await comment(authorToken, postId, 'the first remark');
    const second = await comment(talkerToken, postId, 'an unrelated later remark');
    const replyA = await comment(talkerToken, postId, 'replying to the first', first);
    const replyB = await comment(authorToken, postId, 'and again', first);

    const res = await list(postId, talkerToken);
    expect(res.status).toBe(200);
    const ids = res.body.items.map((c: { commentId: string }) => c.commentId);
    /**
     * The whole point, as an ordering: the two replies sit UNDER the comment
     * they answer, in the order they were written, and the unrelated later
     * comment stays after them rather than being interleaved by raw time.
     */
    expect(ids).toEqual([first, replyA, replyB, second]);
    const byId = new Map(res.body.items.map((c: { commentId: string }) => [c.commentId, c]));
    expect((byId.get(replyA) as { parentCommentId: string }).parentCommentId).toBe(first);
    expect((byId.get(second) as { parentCommentId: string | null }).parentCommentId).toBeNull();
  }, 120_000);

  it('FR-025 a reply to a reply attaches to the deepest PERMITTED ancestor', async () => {
    const author = await h.createPerson('deepAuthor');
    const token = await h.token(author);
    const postId = await publishReady(token, 'a post with a deep thread');

    const root = await comment(token, postId, 'the root');
    const reply = await comment(token, postId, 'one level down', root);
    const deeper = await comment(token, postId, 'two levels down', reply);

    const res = await list(postId, token);
    const byId = new Map(res.body.items.map((c: { commentId: string }) => [c.commentId, c]));
    /**
     * RE-PARENTED, NOT REFUSED. Nesting is bounded at one level for display; a
     * person answering a reply has done nothing wrong and must not be told so.
     * The bound lives in FR-025 itself, so a reader can test it from the spec.
     */
    expect((byId.get(deeper) as { parentCommentId: string }).parentCommentId).toBe(root);
    expect(res.body.items.map((c: { commentId: string }) => c.commentId)).toEqual([
      root,
      reply,
      deeper,
    ]);
  }, 120_000);
});
