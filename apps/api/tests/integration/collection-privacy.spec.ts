import request from 'supertest';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';
import { bootHarness, type Harness } from './harness';

/**
 * 008/T205, US15 — FR-050, SC-015, Constitution Principle III.
 *
 * A COLLECTION IS READABLE ONLY BY ITS OWNER, driven the way a modified client
 * would drive it: another person's collection id, sent directly, with a valid
 * token of the caller's own. The app offers no way to type somebody else's
 * collection id, which is exactly why this file exists — Principle III asks for
 * the hostile path and not for the argument.
 *
 * THE GUARANTEE IS STRUCTURAL BEFORE IT IS CHECKED. A collection lives under
 * `USER#<ownerId>` with no index projecting it, so the read the service performs
 * is on the CALLER's partition: somebody else's id resolves to nothing, and the
 * refusal does not depend on an owner comparison anybody has to remember. This
 * suite asserts the behaviour that structure produces, on every route.
 */
describe('008/US15 a collection is private to its owner', () => {
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

  it('FR-050 every collection route refuses another person, and the same way a made-up id is refused', async () => {
    const ownerToken = await h.token(await h.createPerson('collOwner'));
    const strangerToken = await h.token(await h.createPerson('collStranger'));

    const created = await request(server())
      .post('/v1/me/collections')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Things to cook' });
    expect({ step: 'create', status: created.status }).toEqual({ step: 'create', status: 201 });
    const collectionId = created.body.collectionId as string;

    const postId = await publishReady(ownerToken, 'a recipe');
    const added = await request(server())
      .put(`/v1/me/collections/${collectionId}/posts/${postId}`)
      .set('authorization', `Bearer ${ownerToken}`);
    expect({ step: 'add', status: added.status }).toEqual({ step: 'add', status: 204 });

    const invented = '01JZZZZZZZZZZZZZZZZZZZZZZZ';
    /**
     * EVERY ROUTE, and each compared against the SAME route with an invented id.
     * "It refused" is not the guarantee; the guarantee is that the two answers
     * are indistinguishable, so a collection id cannot be used as an oracle for
     * whether a named person keeps one.
     */
    const routes: { method: 'get' | 'patch' | 'delete' | 'put'; path: (id: string) => string; body?: object }[] = [
      { method: 'get', path: (id) => `/v1/me/collections/${id}/posts` },
      { method: 'patch', path: (id) => `/v1/me/collections/${id}`, body: { name: 'mine now' } },
      { method: 'delete', path: (id) => `/v1/me/collections/${id}` },
      { method: 'put', path: (id) => `/v1/me/collections/${id}/posts/${postId}` },
      { method: 'delete', path: (id) => `/v1/me/collections/${id}/posts/${postId}` },
    ];
    for (const route of routes) {
      const real = await request(server())
        [route.method](route.path(collectionId))
        .set('authorization', `Bearer ${strangerToken}`)
        .send(route.body ?? {});
      const fake = await request(server())
        [route.method](route.path(invented))
        .set('authorization', `Bearer ${strangerToken}`)
        .send(route.body ?? {});
      expect({ route: route.path(':id'), real: real.status, invented: fake.status }).toEqual({
        route: route.path(':id'),
        real: 404,
        invented: 404,
      });
    }

    // Nor does it appear in a stranger's own list, which is the other way it
    // could leak — and the owner's is untouched by all of the above.
    const theirs = await request(server())
      .get('/v1/me/collections')
      .set('authorization', `Bearer ${strangerToken}`);
    expect(theirs.body.items).toEqual([]);

    const mine = await request(server())
      .get('/v1/me/collections')
      .set('authorization', `Bearer ${ownerToken}`);
    expect(mine.body.items.map((c: { collectionId: string }) => c.collectionId)).toContain(
      collectionId,
    );
  }, 120_000);

  it('SURFACE 16 a collected post whose author goes private stops being readable', async () => {
    const readerToken = await h.token(await h.createPerson('collReader'));
    const authorToken = await h.token(await h.createPerson('collAuthor'));

    const postId = await publishReady(authorToken, 'collected while the account was open');
    const created = await request(server())
      .post('/v1/me/collections')
      .set('authorization', `Bearer ${readerToken}`)
      .send({ name: 'Saved reading' });
    const collectionId = created.body.collectionId as string;
    const added = await request(server())
      .put(`/v1/me/collections/${collectionId}/posts/${postId}`)
      .set('authorization', `Bearer ${readerToken}`);
    expect({ step: 'add', status: added.status }).toEqual({ step: 'add', status: 204 });

    const before = await request(server())
      .get(`/v1/me/collections/${collectionId}/posts`)
      .set('authorization', `Bearer ${readerToken}`);
    expect(before.body.items.map((p: { postId: string }) => p.postId)).toContain(postId);

    await request(server())
      .patch('/v1/me')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ accountPrivacy: 'private' });

    /**
     * PRIVATE BY KEY ANSWERS "WHOSE LIST IS THIS", NOT "WHAT IS IN IT".
     *
     * The only person who can ask is the owner, and they collected this post
     * themselves — which is exactly the argument the saved list had, and it was
     * wrong there too. A membership row is a bookmark, not a copy.
     */
    const after = await request(server())
      .get(`/v1/me/collections/${collectionId}/posts`)
      .set('authorization', `Bearer ${readerToken}`);
    expect(after.body.items.map((p: { postId: string }) => p.postId)).not.toContain(postId);
  }, 120_000);
});
