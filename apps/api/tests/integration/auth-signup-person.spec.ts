/**
 * 011/T026. FR-006 — THE ACCOUNT SIGN-UP CREATES IS AN ORDINARY PERSON.
 *
 * This requirement reads as though it needs no test: the feature "adds nothing
 * to what a person is", so what is there to check? That is exactly why it has
 * one. **An untested claim that nothing changed is the claim most likely to be
 * false**, and it had no task at all until the analysis pass gave it one.
 *
 * The product has six features of surfaces that read a person, all of them
 * written against people created by `createProfile` or by the device-token
 * script. Sign-up is a seventh writer of the same row, and the way it would go
 * wrong is not a crash — it is a missing field that every existing surface
 * tolerates until one does not: `displayNameLower` absent and the person is
 * unsearchable, `notificationPrefs` absent and the preferences screen renders
 * empty, `status` absent and `PersonRepository.search` filters them out of
 * their own results.
 *
 * So this signs up and then walks the surfaces, with no special handling
 * anywhere — which is the whole claim, stated as assertions.
 */
import request from 'supertest';
import type { Pool } from 'pg';
import { PG_POOL } from '../../src/persistence/pg-pool';
import { resetRateLimitsForTests } from '../../src/common/rate-limit/rate-limit.guard';
import { bootHarness, type Harness } from './harness';

let h: Harness;
let pool: Pool;

const written: string[] = [];
const nonce = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

beforeAll(async () => {
  h = await bootHarness();
  pool = h.module.get<Pool>(PG_POOL);
}, 60_000);

beforeEach(() => resetRateLimitsForTests());

afterAll(async () => {
  for (const key of written) {
    await pool.query('delete from items where pk = $1 or gsi1pk = $1', [key]);
  }
  await h.close();
});

describe('a person created by signing up', () => {
  it('is readable, searchable and can act, with no special handling', async () => {
    const handle = `ord${nonce()}`.toLowerCase().slice(0, 30);
    const email = `${handle}@example.com`;
    written.push(`HANDLE#${handle}`, `CRED#${email}`);

    const signUp = await request(h.app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({ email, password: 'a-long-enough-password', handle, displayName: 'Ordinary Person' });
    expect(signUp.status).toBe(201);
    const token = signUp.body.token as string;

    /** The credential identifies them to the ordinary authenticated route. */
    const me = await request(h.app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.handle).toBe(handle);

    /**
     * Their public profile resolves BY HANDLE, which is the lookup Phase 2 was
     * about. A sign-up that wrote no index entry would 404 here while `GET /me`
     * kept working — the person existing and being findable are two facts.
     */
    const profile = await request(h.app.getHttpServer()).get(`/v1/people/${handle}`);
    expect(profile.status).toBe(200);
    expect(profile.body.displayName).toBe('Ordinary Person');

    /**
     * AND THE EMAIL IS NOT ON IT. `profile.projection.ts` is the one place a
     * public profile is built, so a field added there is published on all seven
     * projections at once — which is how 008/US5 found `avatarUrl` emitted as a
     * raw storage key, and 006/R4b before it.
     */
    expect(JSON.stringify(profile.body)).not.toContain(email);
    expect(JSON.stringify(profile.body).toLowerCase()).not.toContain('password');

    /**
     * Searchable, which needs `displayNameLower` and `status` to have been
     * written. `GET /people?q=` — the first version of this line guessed
     * `/v1/search/people`, got a 404, and would have been read as the product
     * failing FR-006 rather than as the test naming a route that does not exist.
     * `/v1/search` holds posts only.
     *
     * Searched as SOMEBODY ELSE, because `PersonSearchService` excludes the
     * viewer from their own results — a fact that broke a journey of 008's an
     * hour after it broke one of its tests.
     */
    const otherId = await h.createPerson('searcher');
    const search = await request(h.app.getHttpServer())
      .get(`/v1/people?q=${handle.slice(0, 8)}`)
      .set('Authorization', `Bearer ${await h.token(otherId)}`);
    expect(search.status).toBe(200);
    expect((search.body.items as { handle: string }[]).map((p) => p.handle)).toContain(handle);

    /** And the feed answers for them, which is the screen they land on. */
    const feed = await request(h.app.getHttpServer())
      .get('/v1/feed/home')
      .set('Authorization', `Bearer ${token}`);
    expect(feed.status).toBe(200);
  }, 60_000);

  it('holds the notification preferences every existing surface expects', async () => {
    const handle = `prefs${nonce()}`.toLowerCase().slice(0, 30);
    const email = `${handle}@example.com`;
    written.push(`HANDLE#${handle}`, `CRED#${email}`);

    const signUp = await request(h.app.getHttpServer())
      .post('/v1/auth/sign-up')
      .send({ email, password: 'a-long-enough-password', handle, displayName: 'Prefs' });
    expect(signUp.status).toBe(201);

    const me = await request(h.app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${signUp.body.token as string}`);

    /**
     * All four categories. 004 recorded a screen holding three while the list
     * that DESCRIBES notifications held four — "two lists for one thing: the
     * duplicate is not a risk of drift, it IS the drift" — so a new writer of
     * this row asserting only that it is non-empty would miss exactly that.
     */
    expect(me.body.notificationPrefs).toEqual({
      reaction: true,
      comment: true,
      follow: true,
      message: true,
    });
  }, 30_000);
});
