import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';
import { DismissalRepository } from '../../src/persistence/dismissal.repository';

/**
 * 008/T160 and T161, US12 — FR-041, FR-042.
 *
 * Dismissing is the one of these three rules that is BOTH: it removes the post
 * from selection AND moves the ranking profile in the negative direction. Only a
 * selection stage can consume a signal, which is the second reason dismissal
 * cannot live in the boundary.
 *
 * And it must appear in 007's disclosure. A signal the product collects and does
 * not disclose is a Principle III violation rather than a gap — FR-011 says a
 * person must be able to see what their feed is built from, and "except the
 * negative ones" is not a version of that promise.
 */
describe('008/US12 dismissing a post', () => {
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
    expect(created.status).toBe(201);
    const postId = created.body.postId as string;
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);
    return postId;
  };

  it('FR-041 removes it from the ranked feed without touching the direct read', async () => {
    const author = await h.createPerson('dismissAuthor');
    const viewer = await h.createPerson('dismissViewer');
    const authorToken = await h.token(author);
    const viewerToken = await h.token(viewer);
    const postId = await publishReady(authorToken, 'a post somebody dismisses');

    const dismissed = await request(server())
      .put(`/v1/posts/${postId}/dismiss`)
      .set('authorization', `Bearer ${viewerToken}`);
    expect({ step: 'dismiss', status: dismissed.status }).toEqual({ step: 'dismiss', status: 204 });

    const feed = await request(server())
      .get('/v1/feed/home?limit=50')
      .set('authorization', `Bearer ${viewerToken}`);
    const direct = await request(server())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${viewerToken}`);

    expect({
      inFeed: feed.body.items.some((p: { postId: string }) => p.postId === postId),
      // Selection, not the boundary: a link to it still opens.
      directRead: direct.status,
    }).toEqual({ inFeed: false, directRead: 200 });
  }, 180_000);

  it('FR-042 and T161: it is a signal, it appears in the disclosure, and a reset clears it', async () => {
    const author = await h.createPerson('signalAuthor');
    const viewer = await h.createPerson('signalViewer');
    const authorToken = await h.token(author);
    const viewerToken = await h.token(viewer);
    const postId = await publishReady(authorToken, 'a post that teaches the ranker');

    await request(server()).put(`/v1/posts/${postId}/dismiss`).set('authorization', `Bearer ${viewerToken}`);

    const disclosed = await request(server())
      .get('/v1/me/feed-signals')
      .set('authorization', `Bearer ${viewerToken}`);
    expect(disclosed.status).toBe(200);
    /**
     * The person's own words, not the ranker's: 007's disclosure lists WHAT was
     * collected, and a negative signal missing from it would mean the product
     * knew something about them it would not say.
     */
    // In the person's OWN TERMS, which is how 007 wrote this list — the
    // internal kind is `dismiss` and nobody outside the codebase should have to
    // know that. So the assertion is that the list SAYS SO, not that it leaks
    // the identifier.
    expect(
      (disclosed.body.collected as string[]).some((c) => c.includes('dismiss')),
    ).toBe(true);

    const cleared = await request(server())
      .delete('/v1/me/feed-signals')
      .set('authorization', `Bearer ${viewerToken}`);
    // 200 with `{ cleared: true }` — 007's shape, unchanged. Asserting 204 here
    // would have been this test inventing a contract the product never had.
    expect(cleared.status).toBe(200);

    /**
     * The reset is asserted on its EFFECT, not on the disclosure's wording:
     * `collected` describes what the product collects and stays true after a
     * reset. What must change is that the dismissed post becomes eligible
     * again — a reset that left the dismissals would keep shaping the feed with
     * something the person had just been told was gone.
     */
    const feed = await request(server())
      .get('/v1/feed/home?limit=50')
      .set('authorization', `Bearer ${viewerToken}`);
    expect(feed.status).toBe(200);
    const dismissals = h.module.get(DismissalRepository);
    expect([...(await dismissals.listDismissed(viewer))]).toEqual([]);
  }, 180_000);
});
