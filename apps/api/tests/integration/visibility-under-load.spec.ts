import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * T058, FR-007. A visibility change takes effect immediately **under load**.
 *
 * The 294-assertion matrix exercises the guarantee at rest. That is not the same
 * claim: a design that reached the latency budget by holding read results would
 * still pass the matrix and fail here, and that is exactly the trade a
 * performance change is tempted to make. Principle II forbids it, so it needs a
 * test that would notice.
 */
describe('FR-007 — a visibility flip lands immediately while reads are in flight', () => {
  let h: Harness;
  let authorToken: string;
  let readerToken: string;
  let interestId: string;

  beforeAll(async () => {
    h = await bootHarness();
    authorToken = await h.token(await h.createPerson('flipauthor'));
    readerToken = await h.token(await h.createPerson('flipreader'));
    interestId = await h.topInterestId();
  }, 60_000);

  afterAll(async () => h?.close());

  it('no concurrent reader sees the post after the flip returns', async () => {
    const created = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ uploadIds: [await h.uploadId(authorToken)], interestIds: [interestId] });
    const postId = created.body.postId as string;

    // Make it readable by others.
    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);

    /**
     * One listener, plain fetch. supertest starts a fresh server per call, and
     * concurrent calls race on ephemeral ports long before the API is under any
     * real pressure - the failure looks like ECONNRESET and says nothing about
     * the guarantee under test.
     */
    await h.app.listen(0);
    const base = await h.app.getUrl();
    const read = async () =>
      fetch(`${base}/v1/posts/${postId}`, { headers: { authorization: `Bearer ${readerToken}` } });

    expect((await read()).status).toBe(200);

    // Keep reads in flight across the flip, then assert on everything that
    // resolved AFTER it returned. Reads that started before are not the claim.
    let flipped = false;
    const after: number[] = [];
    // Modest counts: supertest binds a fresh ephemeral port per request, and
    // hundreds at once exhausts them before the API is under any real pressure.
    const readers = Array.from({ length: 8 }, async () => {
      for (let i = 0; i < 6; i++) {
        // Only reads that BEGIN after the flip returned are the claim. A read
        // already in flight when the change committed may legitimately answer
        // from the state it started in; counting those would be asserting
        // something stronger than FR-007 says, and would fail for the wrong
        // reason.
        const startedAfterFlip = flipped;
        const res = await read();
        await res.arrayBuffer();
        if (startedAfterFlip) after.push(res.status);
      }
    });

    const flip = (async () => {
      await new Promise((r) => setTimeout(r, 50));
      const res = await fetch(`${base}/v1/posts/${postId}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${authorToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ visibility: 'private' }),
      });
      expect(res.status).toBe(200);
      flipped = true;
    })();

    await Promise.all([...readers, flip]);

    expect(after.length).toBeGreaterThan(0);
    // Not one read after the flip may still return the post.
    expect(after.filter((s) => s === 200)).toEqual([]);
  }, 120_000);
});
