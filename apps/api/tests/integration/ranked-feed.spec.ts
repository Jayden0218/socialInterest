import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * 007/SC-001 — THE FEED MOVES IN THE DIRECTION OF WHAT A PERSON DOES.
 *
 * "After a session in which a person engages with one interest and skips
 * another, the next feed places the engaged interest's posts measurably
 * earlier — verified by comparing positions before and after, not by
 * inspection."
 *
 * That last clause is the whole design of this test. A ranked feed can be made
 * to look right at a glance in a hundred ways that are not ranking, so the
 * assertion is a BEFORE and an AFTER of the same posts for the same person,
 * with one scripted session in between. Nothing here inspects a weight, and
 * nothing asserts a specific order — only that the order MOVED, and which way.
 */
describe('SC-001 — a session changes the next feed', () => {
  let h: Harness;
  let viewerToken: string;
  let engagedInterest: string;
  let skippedInterest: string;
  const engagedPosts: string[] = [];
  const skippedPosts: string[] = [];

  const publish = async (token: string, interestId: string) => {
    const created = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({ uploadIds: [await h.uploadId(token)], interestIds: [interestId] });
    expect(created.status).toBe(201);
    const postId = created.body.postId as string;
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);
    return postId;
  };

  /**
   * Mean position of a set of posts across several responses, or `null` where
   * none of them appeared.
   *
   * AVERAGED ACROSS RESPONSES on purpose. Exploration re-samples every request,
   * so one response is a draw from a random process and a before/after pair of
   * single draws would report noise as a result — the same mistake as measuring
   * a feedback loop from one page.
   */
  const meanPosition = async (ids: string[]): Promise<number | null> => {
    const positions: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(h.app.getHttpServer())
        .get('/v1/feed/home?limit=25')
        .set('authorization', `Bearer ${viewerToken}`);
      expect(res.status).toBe(200);
      const page = res.body.items.map((item: { postId: string }) => item.postId) as string[];
      for (const id of ids) {
        const at = page.indexOf(id);
        if (at >= 0) positions.push(at);
      }
    }
    return positions.length === 0 ? null : positions.reduce((a, b) => a + b, 0) / positions.length;
  };

  beforeAll(async () => {
    h = await bootHarness();
    const author = await h.token(await h.createPerson('rankedauthor'));
    viewerToken = await h.token(await h.createPerson('rankedviewer'));

    const tops = await request(h.app.getHttpServer()).get('/v1/interests?level=top&limit=50');
    engagedInterest = tops.body.items[0].interestId;
    skippedInterest = tops.body.items[1].interestId;

    /**
     * BOTH interests are declared, so both are in the candidate set from the
     * first request and the comparison is about ORDER rather than about
     * membership. Without this the "after" feed could win simply by containing
     * posts the "before" feed never proposed, which would prove nothing about
     * ranking.
     */
    for (const id of [engagedInterest, skippedInterest]) {
      await request(h.app.getHttpServer())
        .put(`/v1/interests/${id}/follow`)
        .set('authorization', `Bearer ${viewerToken}`);
    }

    // Interleaved, so neither set is systematically newer than the other.
    for (let i = 0; i < 3; i++) {
      skippedPosts.push(await publish(author, skippedInterest));
      engagedPosts.push(await publish(author, engagedInterest));
    }
  }, 300_000);

  afterAll(async () => h?.close());

  it('engaging with one interest and skipping another moves the next feed', async () => {
    const engagedBefore = await meanPosition(engagedPosts);
    const skippedBefore = await meanPosition(skippedPosts);
    expect(engagedBefore).not.toBeNull();
    expect(skippedBefore).not.toBeNull();

    /**
     * THE SESSION. A person opens the engaged interest's posts, stays on them,
     * and saves one; they do nothing at all with the skipped interest's. This
     * is the whole input — no weight is written by hand, because a test that
     * seeds the profile directly asserts that the RANKER reads a profile and
     * says nothing about whether using the product produces one.
     */
    for (const postId of engagedPosts) {
      const res = await request(h.app.getHttpServer())
        .post('/v1/signals')
        .set('authorization', `Bearer ${viewerToken}`)
        .send({
          signals: [
            { kind: 'open', postId },
            { kind: 'dwell', postId, dwellMs: 25_000 },
            { kind: 'save', postId },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.accepted).toBe(3);
    }

    const engagedAfter = await meanPosition(engagedPosts);
    const skippedAfter = await meanPosition(skippedPosts);
    expect(engagedAfter).not.toBeNull();

    // Lower index = earlier on the page. The engaged set moved forward.
    expect(engagedAfter!).toBeLessThan(engagedBefore!);

    /**
     * And it moved forward RELATIVE TO the skipped set, which is the claim.
     * "Everything moved up" is what a shorter page produces; the gap between
     * the two is what only ranking produces.
     */
    const gapBefore = skippedBefore! - engagedBefore!;
    const gapAfter = (skippedAfter ?? 25) - engagedAfter!;
    expect(gapAfter).toBeGreaterThan(gapBefore);
  }, 300_000);
});
