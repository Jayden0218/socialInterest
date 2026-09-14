/**
 * 011/T027. A REFUSAL MUST NOT SAY WHETHER THE ADDRESS HAS AN ACCOUNT
 * (SC-004, FR-009, contract §4).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE MESSAGE IS THE EASY HALF. THE TIMING IS THE GUARANTEE.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Every implementation satisfies "same message, same status" — it is one string
 * and one number. The natural implementation then gives the answer away in how
 * long it takes: look up, return early when absent, and the unknown address
 * answers in about a millisecond while the wrong password answers after a
 * deliberately ~100ms key derivation.
 *
 * That is not a subtle leak. It is two orders of magnitude, measurable over a
 * phone network by anybody working through a list of addresses — and it is
 * invisible to any test that checks the response.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * MEASURED AS DISTRIBUTIONS, NOT AS TWO STOPWATCH READINGS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A single sample of each would be comparing two numbers produced by a machine
 * running a test suite, a garbage collector and fifty other suites. So each
 * population is sampled repeatedly and compared at the MEDIAN, which the
 * occasional 300ms outlier cannot move.
 *
 * And the threshold is a RATIO rather than a number of milliseconds. An absolute
 * bound would encode this machine's speed and would have to be re-tuned on a
 * slower one — the invented-constant failure this project paid four device runs
 * for. A ratio asks the question the requirement actually asks: are these two
 * populations separable?
 *
 * T028 WATCHED THIS FAIL against a deliberately naive implementation before the
 * real one existed. A timing test that has never seen the leak is a timing test
 * nobody should trust — recorded in `docs/verification/011-guard-red-log.md`.
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

/** Enough to have a median that means something; few enough to run in a suite. */
const SAMPLES = 12;

const signIn = (email: string, password: string) =>
  request(h.app.getHttpServer()).post('/v1/auth/sign-in').send({ email, password });

async function sample(email: string, password: string): Promise<{ ms: number[]; statuses: number[]; bodies: string[] }> {
  const ms: number[] = [];
  const statuses: number[] = [];
  const bodies: string[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    // The limiter would refuse part of the population and refuse it FAST, which
    // would look exactly like the leak this is measuring — in the other
    // direction, and just as wrong.
    resetRateLimitsForTests();
    const started = process.hrtime.bigint();
    const res = await signIn(email, password);
    ms.push(Number(process.hrtime.bigint() - started) / 1e6);
    statuses.push(res.status);
    bodies.push(JSON.stringify(res.body));
  }
  return { ms, statuses, bodies };
}

const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

let known: { ms: number[]; statuses: number[]; bodies: string[] };
let unknown: { ms: number[]; statuses: number[]; bodies: string[] };

beforeAll(async () => {
  h = await bootHarness();
  pool = h.module.get<Pool>(PG_POOL);

  const handle = `timing${nonce()}`.toLowerCase().slice(0, 30);
  const email = `${handle}@example.com`;
  written.push(`HANDLE#${handle}`, `CRED#${email}`);

  resetRateLimitsForTests();
  const created = await request(h.app.getHttpServer())
    .post('/v1/auth/sign-up')
    .send({ email, password: 'a-long-enough-password', handle, displayName: 'Timing' });
  if (created.status !== 201) {
    throw new Error(`could not create the account this suite measures: ${created.status}`);
  }

  // Sampled once, in beforeAll, so every assertion below reads the SAME
  // populations. Re-sampling per assertion would let two of them disagree.
  known = await sample(email, 'the-wrong-password-entirely');
  unknown = await sample(`absent-${nonce()}@example.com`, 'the-wrong-password-entirely');
}, 180_000);

afterAll(async () => {
  for (const key of written) {
    await pool.query('delete from items where pk = $1 or gsi1pk = $1', [key]);
  }
  await h.close();
});

describe('a sign-in refusal does not reveal whether the account exists', () => {
  it('refuses both with the same status', () => {
    expect(new Set(known.statuses)).toEqual(new Set([401]));
    expect(new Set(unknown.statuses)).toEqual(new Set([401]));
  });

  it('refuses both with the same body, byte for byte', () => {
    /**
     * Not "a similar message" — the same bytes. A body that differed by a field
     * order, a trailing detail or an echoed address would be as good an oracle
     * as a different sentence.
     */
    expect(new Set([...known.bodies, ...unknown.bodies]).size).toBe(1);
  });

  it('refuses both in the same time, compared at the median', () => {
    const knownMs = median(known.ms);
    const unknownMs = median(unknown.ms);
    const ratio = Math.max(knownMs, unknownMs) / Math.min(knownMs, unknownMs);

    /**
     * 2x, against a leak that is ~100x.
     *
     * Deliberately loose. The populations differ by one datastore read that the
     * unknown case does make and finds nothing in, so they are not identical and
     * pretending otherwise would produce a flaky test that gets deleted. What
     * this has to separate is a ~1ms answer from a ~100ms one, and anything
     * under 2x is nowhere near able to carry that information.
     */
    expect(ratio).toBeLessThan(2);
  });

  it('and both really did cost the key derivation', () => {
    /**
     * THE RATIO ALONE CAN BE SATISFIED BY BEING EQUALLY FAST.
     *
     * If somebody removed the derivation entirely, both populations would answer
     * in a millisecond, the ratio would be ~1, and the test above would pass over
     * a product storing passwords it never checks. So the floor is asserted too:
     * a refusal must have paid for a derivation, whichever branch it took.
     */
    expect(median(known.ms)).toBeGreaterThan(20);
    expect(median(unknown.ms)).toBeGreaterThan(20);
  });
});
