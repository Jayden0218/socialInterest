/**
 * 011/T036. THE RATE LIMIT MUST NOT DEPEND ON WHETHER THE ACCOUNT EXISTS
 * (FR-010).
 *
 * A limit keyed on anything derived from the account would have to know whether
 * the account exists in order to bucket the request — and that is the exact fact
 * the rest of this feature spends a key derivation hiding. It would be a timing
 * leak rebuilt as a counting leak: exhaust the bucket for an address, see
 * whether the refusals change shape, and you have your answer.
 *
 * Research R7 checked rather than assumed that the existing guard does the right
 * thing here: `RateLimitGuard` keys on `req.viewer?.userId ?? req.ip`, and a
 * public route has no viewer, so it falls back to the client IP. That was worth
 * checking because the guard was written for AUTHENTICATED routes — publishing,
 * commenting, sub-interest creation — and a viewer-only key would have bucketed
 * every failed sign-in in the world together under `'anonymous'`.
 *
 * This asserts the consequence rather than the mechanism: two populations, one
 * with an account and one without, are refused by the limiter after the same
 * number of attempts and in the same way.
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

let realEmail: string;

const attemptsUntilLimited = async (email: string): Promise<{ before: number; body: string }> => {
  resetRateLimitsForTests();
  let before = 0;
  for (let i = 0; i < 40; i++) {
    const res = await request(h.app.getHttpServer())
      .post('/v1/auth/sign-in')
      .send({ email, password: 'the-wrong-password-entirely' });
    if (res.status === 429) return { before, body: JSON.stringify(res.body) };
    before++;
  }
  throw new Error('the limiter never engaged — this suite cannot measure what it is for');
};

beforeAll(async () => {
  h = await bootHarness();
  pool = h.module.get<Pool>(PG_POOL);

  const handle = `rl${nonce()}`.toLowerCase().slice(0, 30);
  realEmail = `${handle}@example.com`;
  written.push(`HANDLE#${handle}`, `CRED#${realEmail}`);

  resetRateLimitsForTests();
  const created = await request(h.app.getHttpServer())
    .post('/v1/auth/sign-up')
    .send({ email: realEmail, password: 'a-long-enough-password', handle, displayName: 'Limited' });
  if (created.status !== 201) throw new Error(`setup failed: ${created.status}`);
}, 120_000);

afterAll(async () => {
  for (const key of written) {
    await pool.query('delete from items where pk = $1 or gsi1pk = $1', [key]);
  }
  await h.close();
});

describe('the sign-in rate limit', () => {
  it('engages after the same number of attempts, account or no account', async () => {
    const existing = await attemptsUntilLimited(realEmail);
    const absent = await attemptsUntilLimited(`absent-${nonce()}@example.com`);

    expect(absent.before).toBe(existing.before);

    /**
     * THE SHAPE, NOT THE BYTES — and the first version of this assertion got it
     * wrong in an instructive way.
     *
     * It compared the two 429 bodies byte for byte and failed on
     * `"Retry in 7s"` against `"Retry in 6s"`. That difference is not an oracle:
     * `Retry-After` is computed from how much of a token has refilled, which is
     * a function of ELAPSED TIME, so it moves with the scheduler and would
     * differ between two runs of the same population.
     *
     * Asserting it would have produced a flaky test that eventually gets deleted
     * — and deleting it would take the real assertion with it. What must not
     * differ is the title and the status, and the systematic timing difference
     * that WOULD make `Retry-After` an oracle is bounded by
     * `auth-signin-timing.spec.ts` at under 2x. One guard per fact.
     */
    const shape = (body: string): unknown => {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      delete parsed['detail'];
      return parsed;
    };
    expect(shape(absent.body)).toEqual(shape(existing.body));
  }, 180_000);

  it('does not bucket by the address, which would require knowing it exists', async () => {
    /**
     * TWO DIFFERENT ADDRESSES SHARE A BUCKET.
     *
     * This looks like a weakness and it is the requirement: a per-address bucket
     * would let somebody work through a list at full speed, one attempt each,
     * and would have to resolve each address to bucket it. Everybody behind one
     * NAT sharing a bucket is the accepted cost (R7), and the capacity is chosen
     * with it in mind.
     */
    resetRateLimitsForTests();
    let refused = false;
    for (let i = 0; i < 40 && !refused; i++) {
      const res = await request(h.app.getHttpServer())
        .post('/v1/auth/sign-in')
        .send({ email: `spray-${nonce()}-${i}@example.com`, password: 'wrong-password-here' });
      refused = res.status === 429;
    }
    expect(refused).toBe(true);
  }, 180_000);
});
