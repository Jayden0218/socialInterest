import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { SignalRepository } from '../../src/persistence/signal.repository';
import { SIGNAL_MAX_DWELL_MS, SIGNAL_WEIGHTS } from '../../src/modules/ranking/constants';

/**
 * ===========================================================================
 * contracts/signals.md, "The hostile-client test". Constitution III.
 * ===========================================================================
 *
 * "A test that only drives the app's own client does not cover any of these."
 *
 * Every bound below exists because the client CANNOT be trusted to apply it: a
 * modified client sends any duration it likes, names any post, repeats one
 * signal a thousand times, or claims to be somebody else. So every request here
 * is raw HTTP with a hand-written body — the shape the app's own data layer
 * would never produce, which is precisely why it is the shape worth testing.
 */
describe('signals — the path a modified client would take', () => {
  let h: Harness;
  let interestId: string;
  let attacker: { token: string; userId: string };
  let victim: { token: string; userId: string };
  let visiblePost: string;
  let hiddenPost: string;

  const person = async (handle: string) => {
    const userId = await h.createPerson(handle);
    return { userId, token: await h.token(userId) };
  };

  const publish = async (token: string, visibility?: 'private') => {
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
    if (visibility) {
      await request(h.app.getHttpServer())
        .patch(`/v1/posts/${postId}`)
        .set('authorization', `Bearer ${token}`)
        .send({ visibility });
    }
    return postId;
  };

  const send = (token: string, body: unknown) =>
    request(h.app.getHttpServer())
      .post('/v1/signals')
      .set('authorization', `Bearer ${token}`)
      .send(body as object);

  const profileOf = (userId: string) => h.module.get(SignalRepository).profile(userId);

  beforeAll(async () => {
    h = await bootHarness();
    interestId = await h.topInterestId();
    attacker = await person('signalattacker');
    victim = await person('signalvictim');
    visiblePost = await publish(victim.token);
    hiddenPost = await publish(victim.token, 'private');
  }, 180_000);

  afterAll(async () => h?.close());

  it('case 1 — a signal for a post the caller cannot see moves no weight', async () => {
    const before = await profileOf(attacker.userId);

    const res = await send(attacker.token, { signals: [{ kind: 'save', postId: hiddenPost }] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ accepted: 0, rejected: 1 });

    /**
     * NOT MERELY UNWEIGHTED — nothing is written at all. Recording the event
     * would store the fact that this person looked at a post they are not
     * permitted to know exists, which is the leak wearing the clothes of an
     * audit trail.
     */
    expect(await profileOf(attacker.userId)).toEqual(before);
    const events = await h.module.get(SignalRepository).listEvents(attacker.userId, { limit: 50 });
    expect(events.items.map((e) => e.postId)).not.toContain(hiddenPost);
  }, 60_000);

  it('case 2 — a signal naming another person as its subject is written for the CALLER', async () => {
    // The body carries a userId the server has no business believing. The
    // subject comes from the token; anything else is a client asserting whose
    // behaviour this is, which is not a claim a client gets to make.
    const res = await send(attacker.token, {
      userId: victim.userId,
      signals: [{ kind: 'save', postId: visiblePost, userId: victim.userId }],
    });
    expect(res.status).toBe(201);
    expect(res.body.accepted).toBe(1);

    // The victim's profile is untouched by the attacker's request.
    expect(await profileOf(victim.userId)).toBeNull();
    expect(await profileOf(attacker.userId)).not.toBeNull();
  }, 60_000);

  it('case 3 — an enormous dwellMs is weighted as the clamp, not as sent', async () => {
    const honest = await person('signalhonest');
    const greedy = await person('signalgreedy');

    await send(honest.token, {
      signals: [{ kind: 'dwell', postId: visiblePost, dwellMs: SIGNAL_MAX_DWELL_MS }],
    });
    await send(greedy.token, {
      signals: [{ kind: 'dwell', postId: visiblePost, dwellMs: 999_999_999 }],
    });

    const [h1, h2] = await Promise.all([profileOf(honest.userId), profileOf(greedy.userId)]);
    const weightOf = (p: Awaited<ReturnType<typeof profileOf>>) =>
      Object.values(p?.weights ?? {}).reduce((a, w) => a + w.w, 0);

    // Identical, not merely bounded: the clamp is applied BEFORE weighting, so a
    // client claiming eleven days of attention earns exactly what thirty seconds
    // earns. "Less than something huge" would pass against a leaky clamp.
    expect(weightOf(h2)).toBeCloseTo(weightOf(h1), 6);
    expect(weightOf(h2)).toBeCloseTo(SIGNAL_WEIGHTS.dwell, 6);
  }, 90_000);

  it('case 3b — a dwell below the floor is discarded, not weighted at zero', async () => {
    const brief = await person('signalbrief');
    const res = await send(brief.token, {
      signals: [{ kind: 'dwell', postId: visiblePost, dwellMs: 500 }],
    });
    expect(res.body).toEqual({ accepted: 0, rejected: 1 });
    // A zero-weight event still records that this person saw this post. That is
    // data collected for no ranking benefit, which Principle III does not allow.
    expect(await profileOf(brief.userId)).toBeNull();
  }, 60_000);

  it('an over-long batch is REJECTED, not silently truncated', async () => {
    const spammer = await person('signalspammer');
    const res = await send(spammer.token, {
      signals: Array.from({ length: 500 }, () => ({ kind: 'save', postId: visiblePost })),
    });
    // Truncation would make over-sending look like success and would leave the
    // client with no reason to stop.
    expect(res.body.accepted).toBe(0);
    expect(res.body.rejected).toBe(500);
    expect(await profileOf(spammer.userId)).toBeNull();
  }, 60_000);

  it('repeating one signal in a session is weighted ONCE', async () => {
    const scroller = await person('signalscroller');
    for (let i = 0; i < 25; i++) {
      await send(scroller.token, { signals: [{ kind: 'save', postId: visiblePost }] });
    }
    const total = Object.values((await profileOf(scroller.userId))?.weights ?? {}).reduce(
      (a, w) => a + w.w,
      0,
    );
    expect(total).toBeCloseTo(SIGNAL_WEIGHTS.save, 6);
  }, 120_000);

  it('case 4 — another person\'s signals are on NO surface (FR-013, SC-007)', async () => {
    await send(victim.token, { signals: [{ kind: 'save', postId: visiblePost }] });
    expect(await profileOf(victim.userId)).not.toBeNull();

    /**
     * Every surface that returns something about another person, read as the
     * attacker. Asserted on the SERIALISED response rather than field by field:
     * a field-by-field check only covers the fields somebody thought of, and the
     * failure this guards is a field nobody thought about being added later.
     */
    const authorHandle = (
      await request(h.app.getHttpServer()).get('/v1/me').set('authorization', `Bearer ${victim.token}`)
    ).body.handle;

    const responses = await Promise.all([
      request(h.app.getHttpServer())
        .get(`/v1/people/${authorHandle}`)
        .set('authorization', `Bearer ${attacker.token}`),
      request(h.app.getHttpServer())
        .get(`/v1/people/${authorHandle}/posts`)
        .set('authorization', `Bearer ${attacker.token}`),
      request(h.app.getHttpServer())
        .get(`/v1/posts/${visiblePost}`)
        .set('authorization', `Bearer ${attacker.token}`),
      request(h.app.getHttpServer())
        .get(`/v1/interests/${interestId}/posts`)
        .set('authorization', `Bearer ${attacker.token}`),
      request(h.app.getHttpServer())
        .get('/v1/feed/home')
        .set('authorization', `Bearer ${attacker.token}`),
    ]);

    for (const res of responses) {
      const body = JSON.stringify(res.body);
      expect(body).not.toMatch(/signalProfile|SignalProfile|dwellMs|"weights"|"seedInterests"|"collected"/);
    }

    /**
     * NOT asserted: that the victim's userId is absent. My first version did,
     * and it failed on `GET /people/:handle` — which returns the person's id
     * because it is their profile. That is the shape of a guard written from
     * its own prose rather than from the promise: FR-013 protects what the
     * SIGNALS say, not the existence of the person they belong to. `topInterests`
     * on that same response is derived from their POSTS and is public by
     * 001/FR-038; conflating the two would have made this test assert a privacy
     * rule the product does not have while missing the one it does.
     */

    /**
     * And the disclosure endpoint describes THE CALLER, never the person whose
     * token was not presented. It is deliberately outside the loop above: it is
     * the one surface that is SUPPOSED to carry signal data, so including it
     * there failed the scan on a correct response — a guard cannot be written
     * to forbid a shape and then pointed at the one place the shape belongs.
     */
    const mine = await request(h.app.getHttpServer())
      .get('/v1/me/feed-signals')
      .set('authorization', `Bearer ${attacker.token}`);
    expect(mine.status).toBe(200);
    /**
     * Something only the victim did, chosen so the two answers CANNOT coincide.
     *
     * The first version compared the two disclosures wholesale and failed: both
     * people had saved the same post in the same interest, so the identical
     * answers were correct and the assertion was measuring a coincidence rather
     * than the routing. A seed pick belongs to exactly one account.
     */
    await request(h.app.getHttpServer())
      .post('/v1/me/seed-interests')
      .set('authorization', `Bearer ${victim.token}`)
      .send({ interestIds: [interestId] });

    const victimDisclosure = await request(h.app.getHttpServer())
      .get('/v1/me/feed-signals')
      .set('authorization', `Bearer ${victim.token}`);

    expect(victimDisclosure.body.seedInterests).toEqual([interestId]);
    // Two callers, two different answers, from a route with no subject in its
    // path — which is what makes the subject impossible to state from outside.
    expect(mine.body.seedInterests).toEqual([]);
  }, 120_000);

  it('case 5 — clearing empties the STORE, not just the screen (FR-012)', async () => {
    const quitter = await person('signalquitter');
    await request(h.app.getHttpServer())
      .post('/v1/me/seed-interests')
      .set('authorization', `Bearer ${quitter.token}`)
      .send({ interestIds: [interestId] });
    await send(quitter.token, { signals: [{ kind: 'save', postId: visiblePost }] });
    expect(await profileOf(quitter.userId)).not.toBeNull();

    const cleared = await request(h.app.getHttpServer())
      .delete('/v1/me/feed-signals')
      .set('authorization', `Bearer ${quitter.token}`);
    expect(cleared.status).toBe(200);

    // Read the store directly. "The endpoint returned 200" is what a cosmetic
    // clear also does.
    expect(await profileOf(quitter.userId)).toBeNull();
    const events = await h.module.get(SignalRepository).listEvents(quitter.userId, { limit: 100 });
    expect(events.items).toEqual([]);
  }, 90_000);
});
