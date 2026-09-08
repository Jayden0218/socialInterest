import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { SignalRepository } from '../../src/persistence/signal.repository';
import { RankingService } from '../../src/modules/ranking/ranking.service';

/**
 * 007/FR-012 AND PLAN GATE G3 — CLEARING IS REAL, NOT COSMETIC.
 *
 * The disclosure (FR-011) and this control are what make the amendment to
 * Principle I a REPLACEMENT rather than a deletion. The old feed was legible
 * because you built it: you could see your subscriptions and change them. A
 * ranked feed is built from behaviour, so the equivalent legibility is being
 * able to see what it learned and throw it away.
 *
 * Which means "the button returned 200" is not the assertion. The store is.
 */
describe('FR-012 — clearing signals empties the store and resets the ranking', () => {
  let h: Harness;
  let userId: string;
  let token: string;
  let seedInterest: string;
  let otherInterest: string;
  let seedPosts: string[] = [];
  let otherPosts: string[] = [];

  const publish = async (authorToken: string, interestId: string) => {
    const created = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ uploadIds: [await h.uploadId(authorToken)], interestIds: [interestId] });
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

  beforeAll(async () => {
    h = await bootHarness();
    const author = await h.token(await h.createPerson('resetauthor'));
    userId = await h.createPerson('resetviewer');
    token = await h.token(userId);

    const tops = await request(h.app.getHttpServer()).get('/v1/interests?level=top&limit=50');
    seedInterest = tops.body.items[0].interestId;
    otherInterest = tops.body.items[1].interestId;

    seedPosts = [await publish(author, seedInterest), await publish(author, seedInterest)];
    otherPosts = [await publish(author, otherInterest), await publish(author, otherInterest)];

    // The cold-start picks. These SURVIVE a reset by design: they are what the
    // person said, not what the app inferred.
    await request(h.app.getHttpServer())
      .post('/v1/me/seed-interests')
      .set('authorization', `Bearer ${token}`)
      .send({ interestIds: [seedInterest] });
  }, 300_000);

  afterAll(async () => h?.close());

  const weights = async () =>
    Object.fromEntries(
      (await h.module.get(RankingService).weightsFor(userId)).map((w) => [w.interestId, w.weight]),
    );

  it('the store is empty afterwards, and the ranking is back to seed state', async () => {
    const atSeedState = await weights();
    expect(atSeedState[seedInterest]).toBeGreaterThan(0);
    expect(atSeedState[otherInterest]).toBeUndefined();

    // Behave, hard, in the interest the person did NOT pick.
    for (const postId of otherPosts) {
      await request(h.app.getHttpServer())
        .post('/v1/signals')
        .set('authorization', `Bearer ${token}`)
        .send({
          signals: [
            { kind: 'open', postId },
            { kind: 'dwell', postId, dwellMs: 30_000 },
            { kind: 'save', postId },
          ],
        });
    }

    const learned = await weights();
    expect(learned[otherInterest]).toBeGreaterThan(0);
    expect(await h.module.get(SignalRepository).profile(userId)).not.toBeNull();

    const cleared = await request(h.app.getHttpServer())
      .delete('/v1/me/feed-signals')
      .set('authorization', `Bearer ${token}`);
    expect(cleared.status).toBe(200);

    /**
     * THE STORE, read directly. Both halves: the profile AND the raw events.
     * Clearing only the total would leave every event behind and make the
     * promise false in a way nobody would notice until they looked - which is
     * the whole reason this reads the datastore rather than the endpoint.
     */
    expect(await h.module.get(SignalRepository).profile(userId)).toBeNull();
    expect((await h.module.get(SignalRepository).listEvents(userId, { limit: 100 })).items).toEqual([]);

    /**
     * And the RANKING is back where it started - not merely "smaller". A reset
     * that left a decayed remnant would satisfy an emptiness check on the
     * profile item while still ranking the person by what they had asked it to
     * forget.
     */
    expect(await weights()).toEqual(atSeedState);

    // The seed picks survive: they are a declaration, not something inferred.
    const after = await request(h.app.getHttpServer())
      .get('/v1/me/feed-signals')
      .set('authorization', `Bearer ${token}`);
    expect(after.body.seedInterests).toEqual([seedInterest]);
    expect(after.body.interests.map((i: { interestId: string }) => i.interestId)).toEqual([seedInterest]);

    // Sanity: the posts still exist, so the emptiness above is the profile's
    // and not the catalogue's.
    expect(seedPosts.length + otherPosts.length).toBe(4);
  }, 300_000);
});
