import request from 'supertest';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';
import { bootHarness, type Harness } from './harness';

/**
 * 008/T176, US13 — FR-044 + 001/FR-017, SC-009. THE FLIP LANDS ON THE NEXT READ,
 * EVERYWHERE, WITH NO RE-INDEX STEP.
 *
 * This is the requirement that decides the DESIGN, not just the behaviour. Any
 * implementation that denormalises privacy into the post rows — or into the
 * interest index, or the term index, or the saved list — has to rewrite them
 * when the flip happens, and until that job finishes the product is showing a
 * private account's posts to strangers. D1 refused fan-out-on-write for exactly
 * this reason and the same reasoning applies one level up.
 *
 * So the test does the hostile thing: it flips privacy and reads the surfaces
 * IMMEDIATELY, in the same request sequence, with nothing given a chance to
 * catch up. Anything asynchronous fails here.
 */
describe('008/US13 flipping account privacy takes effect on the next read', () => {
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

  it('FR-044 every surface changes its answer with no step in between', async () => {
    const author = await h.createPerson('flipAuthor');
    const stranger = await h.createPerson('flipStranger');
    const authorToken = await h.token(author);
    const strangerToken = await h.token(stranger);
    const handle = (
      await request(server()).get('/v1/me').set('authorization', `Bearer ${authorToken}`)
    ).body.handle as string;

    const postId = await publishReady(authorToken, 'a public post by someone about to go private');

    /**
     * The surfaces a stranger can reach this post through. Named individually
     * rather than looped over a list, because a surface silently dropped from a
     * list is the gap this whole matrix exists to close.
     */
    const readAll = async () => ({
      detail: (
        await request(server())
          .get(`/v1/posts/${postId}`)
          .set('authorization', `Bearer ${strangerToken}`)
      ).status,
      profile: (
        await request(server())
          .get(`/v1/people/${handle}/posts`)
          .set('authorization', `Bearer ${strangerToken}`)
      ).body.items.some((p: { postId: string }) => p.postId === postId),
      anonymousDetail: (await request(server()).get(`/v1/posts/${postId}`)).status,
    });

    const before = await readAll();
    expect(before).toEqual({ detail: 200, profile: true, anonymousDetail: 200 });

    const flipped = await request(server())
      .patch('/v1/me')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ accountPrivacy: 'private' });
    expect({ step: 'flip', status: flipped.status }).toEqual({ step: 'flip', status: 200 });
    expect(flipped.body.accountPrivacy).toBe('private');

    // No wait, no eventually(), no reconcile. The very next reads.
    const after = await readAll();
    /**
     * 403, NOT 404, and the difference is the contract's error-distinction table
     * rather than an accident. A BLOCK answers `gone` so that the error itself
     * does not disclose the block. A private account is not a secret — the
     * profile says `accountPrivacy: private` to anyone who asks — so the honest
     * answer is `not_for_you`, the same one a followers-only post gives. The
     * first version of this test expected 404 and was wrong about the product.
     */
    expect(after).toEqual({ detail: 403, profile: false, anonymousDetail: 403 });

    // And back, because a one-way test would pass on an implementation that
    // could only ever hide things.
    await request(server())
      .patch('/v1/me')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ accountPrivacy: 'open' });
    expect(await readAll()).toEqual({ detail: 200, profile: true, anonymousDetail: 200 });
  }, 60_000);

  it('the author still sees their own posts throughout', async () => {
    const author = await h.createPerson('flipSelfReader');
    const authorToken = await h.token(author);
    const postId = await publishReady(authorToken, 'mine either way');

    await request(server())
      .patch('/v1/me')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ accountPrivacy: 'private' });

    const mine = await request(server())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${authorToken}`);
    // Going private must not hide your own work from you — the failure mode of
    // implementing the clause before the `isAuthor` return rather than after it.
    expect(mine.status).toBe(200);
  }, 60_000);
});
