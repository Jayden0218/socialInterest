import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';

/**
 * 008/T121, US8 — FR-029, Principle III. THE PATH A HOSTILE CLIENT WOULD TAKE.
 *
 * The app shows edit and delete only on your own comment, which is a statement
 * about the app and none at all about the server. This drives the requests
 * DIRECTLY with somebody else's comment id, which is the only version of this
 * test that means anything: 002 found a server trusting a client-supplied media
 * key, and 007's signals routes were only ever exercised by a well-behaved
 * caller.
 */
describe('008/US8 only the author may edit or delete a comment', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

  it('FR-029 refuses another person, and the comment is untouched', async () => {
    const author = await h.createPerson('authComment');
    const stranger = await h.createPerson('authStranger');
    const authorToken = await h.token(author);
    const strangerToken = await h.token(stranger);

    const created = await request(server())
      .post('/v1/posts')
      .set('authorization', `Bearer ${authorToken}`)
      .send({
        uploadIds: [await h.uploadId(authorToken)],
        interestIds: [await h.topInterestId()],
        caption: 'a post anyone may read',
        visibility: 'public',
      });
    expect(created.status).toBe(201);
    const postId = created.body.postId as string;
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);

    const mine = await request(server())
      .post(`/v1/posts/${postId}/comments`)
      .set('authorization', `Bearer ${authorToken}`)
      .send({ body: 'my own words' });
    expect(mine.status).toBe(201);
    const commentId = mine.body.commentId as string;

    const edit = await request(server())
      .patch(`/v1/posts/${postId}/comments/${commentId}`)
      .set('authorization', `Bearer ${strangerToken}`)
      .send({ body: 'words I did not write' });
    const remove = await request(server())
      .delete(`/v1/posts/${postId}/comments/${commentId}`)
      .set('authorization', `Bearer ${strangerToken}`);

    /**
     * 403 rather than 404: the comment is PUBLICLY READABLE on a public post,
     * so pretending it does not exist would be a lie the reader can disprove in
     * one request — and this codebase reserves `gone` for content whose very
     * existence must not be confirmed.
     */
    expect({ edit: edit.status, remove: remove.status }).toEqual({ edit: 403, remove: 403 });

    const list = await request(server())
      .get(`/v1/posts/${postId}/comments`)
      .set('authorization', `Bearer ${authorToken}`);
    const found = list.body.items.find((c: { commentId: string }) => c.commentId === commentId);
    expect({ body: found.body, edited: found.editedAt ?? null }).toEqual({
      body: 'my own words',
      edited: null,
    });
  }, 120_000);
});
