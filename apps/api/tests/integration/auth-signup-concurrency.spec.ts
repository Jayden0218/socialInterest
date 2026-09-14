/**
 * 011/T009. TWO SIMULTANEOUS SIGN-UPS FOR ONE ADDRESS PRODUCE EXACTLY ONE
 * ACCOUNT (SC-005, contract §1).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A SEQUENTIAL VERSION OF THIS PROVES NOTHING
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The obvious implementation of uniqueness is a lookup followed by a create.
 * It passes a sequential test perfectly — the second call reads the first's row
 * and refuses — and fails under exactly the two simultaneous requests it exists
 * for, because both read "free" before either writes.
 *
 * So the requests are genuinely in flight together, and the number that matters
 * is how many 201s come back. The same shape found the handle defect: eight of
 * eight simultaneous claims succeeded there, recorded in
 * `docs/verification/011-guard-red-log.md`.
 *
 * `Promise.allSettled`, not `Promise.all`: all but one are expected to be
 * refused, and `all` would reject on the first refusal and tell us nothing about
 * how many got through.
 */
import request from 'supertest';
import type { Pool } from 'pg';
import { PG_POOL } from '../../src/persistence/pg-pool';
import { resetRateLimitsForTests } from '../../src/common/rate-limit/rate-limit.guard';
import { bootHarness, type Harness } from './harness';

let h: Harness;
let pool: Pool;

/**
 * THE RATE LIMITER NEARLY MADE THIS FILE PASS FOR THE WRONG REASON.
 *
 * The first version fired five simultaneous sign-ups against a route with a
 * capacity of five. One came back 201 and the assertion was satisfied — while
 * the OTHER FIVE were refused 429 by the limiter, never reaching the uniqueness
 * constraint at all. Delete the conditional write and the test still passes:
 * five get rate limited, one succeeds, `created` is still 1.
 *
 * That is precisely the failure this file's own header warns about in a
 * different place, and it is the shape this project keeps recording — a guard
 * whose subject moved out from under it while it went on reporting green.
 *
 * Two changes make the measurement real:
 *
 *   1. The bucket is emptied of its history before each batch, and each batch is
 *      sized AT the capacity, so the limiter refuses nothing.
 *   2. Every refusal is asserted NOT to be a 429. If the limiter ever starts
 *      doing the work, this file fails rather than quietly measuring it.
 *
 * Reaching into the guard's bucket map is a test touching a private field, and
 * it is the honest option: the alternative is raising a real rate limit to suit
 * a test, which changes the product to make the measurement convenient.
 */
const resetLimiter = (): void => resetRateLimitsForTests();

/** Sign-up's capacity, from `auth.controller.ts`. A batch may not exceed it. */
const SIGNUP_CAPACITY = 5;

const written: { emails: string[]; handles: string[] } = { emails: [], handles: [] };

/** Per-run, because the local table is shared across runs — three "regressions" here were a grown table. */
const nonce = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const post = (path: string, body: unknown) =>
  request(h.app.getHttpServer()).post(`/v1${path}`).send(body as object);

beforeAll(async () => {
  h = await bootHarness();
  pool = h.module.get<Pool>(PG_POOL);
}, 60_000);

beforeEach(() => resetLimiter());

afterAll(async () => {
  for (const email of written.emails) {
    await pool.query('delete from items where pk = $1', [`CRED#${email}`]);
  }
  for (const handle of written.handles) {
    await pool.query('delete from items where pk = $1 or gsi1pk = $1', [`HANDLE#${handle}`]);
  }
  await h.close();
});

describe('sign-up under concurrency', () => {
  it('admits EXACTLY ONE of five simultaneous sign-ups for one address', async () => {
    const email = `race-${nonce()}@example.com`;
    written.emails.push(email);

    /**
     * EACH ATTEMPT CARRIES ITS OWN HANDLE. If they shared one, the handle claim
     * would refuse five of them and the test would pass without the email
     * constraint ever being exercised — a green that measures the wrong thing,
     * which is the failure mode this whole file is about.
     */
    const attempts = Array.from({ length: SIGNUP_CAPACITY }, (_, i) => {
      const handle = `race${nonce()}${i}`.toLowerCase().slice(0, 30);
      written.handles.push(handle);
      return post('/auth/sign-up', {
        email,
        password: 'a-long-enough-password',
        handle,
        displayName: 'Race',
      });
    });

    const settled = await Promise.allSettled(attempts);
    const statuses = settled.map((r) => (r.status === 'fulfilled' ? r.value.status : 0));

    // THE MEASUREMENT IS ONLY VALID IF THE LIMITER STAYED OUT OF IT.
    expect(statuses).not.toContain(429);

    const created = statuses.filter((s) => s === 201 || s === 200);
    expect(created).toHaveLength(1);

    // And exactly one credential row exists for the address, counted underneath
    // the API rather than inferred from the responses.
    const { rows } = await pool.query<{ n: number }>(
      'select count(*)::int as n from items where pk = $1',
      [`CRED#${email}`],
    );
    expect(rows[0]!.n).toBe(1);
  }, 60_000);

  it('admits EXACTLY ONE of five simultaneous sign-ups for one handle', async () => {
    const handle = `hrace${nonce()}`.toLowerCase().slice(0, 30);
    written.handles.push(handle);

    const attempts = Array.from({ length: SIGNUP_CAPACITY }, (_, i) => {
      const email = `hrace-${nonce()}-${i}@example.com`;
      written.emails.push(email);
      return post('/auth/sign-up', {
        email,
        password: 'a-long-enough-password',
        handle,
        displayName: 'Race',
      });
    });

    const settled = await Promise.allSettled(attempts);
    const statuses = settled.map((r) => (r.status === 'fulfilled' ? r.value.status : 0));
    expect(statuses).not.toContain(429);

    const created = statuses.filter((s) => s === 201 || s === 200);
    expect(created).toHaveLength(1);
  }, 60_000);

  it('refuses a password below the floor BEFORE creating anything', async () => {
    /**
     * Contract §1: the floor is checked before anything is written, so a refused
     * sign-up never leaves a half-made account behind. Asserted by looking for
     * the handle afterwards — a check that the refusal happened is not a check
     * that nothing was written.
     */
    const handle = `short${nonce()}`.toLowerCase().slice(0, 30);
    const email = `short-${nonce()}@example.com`;

    const res = await post('/auth/sign-up', {
      email,
      password: 'short',
      handle,
      displayName: 'Short',
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('10');

    const { rows } = await pool.query<{ n: number }>(
      'select count(*)::int as n from items where pk = $1 or pk = $2',
      [`HANDLE#${handle}`, `CRED#${email}`],
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('cannot produce an operator, whatever the body contains', async () => {
    /**
     * FR-025. The request asks for it in every spelling somebody would try.
     * `issueForPerson` has no parameter for it, so this is asserting that the
     * route reaches that method rather than some other one — which is the part
     * a refactor could break while the type stayed satisfied.
     */
    const handle = `op${nonce()}`.toLowerCase().slice(0, 30);
    const email = `op-${nonce()}@example.com`;
    written.handles.push(handle);
    written.emails.push(email);

    const res = await post('/auth/sign-up', {
      email,
      password: 'a-long-enough-password',
      handle,
      displayName: 'Operator attempt',
      operator: true,
      isOperator: true,
      role: 'operator',
    });
    expect(res.status).toBe(201);

    const [, payload] = (res.body.token as string).split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64').toString('utf8')) as {
      operator?: boolean;
    };
    expect(claims.operator).toBe(false);
  });

  it('folds case and trims, so one address is one account (FR-004)', async () => {
    const local = `fold${nonce()}`;
    const email = `${local}@example.com`;
    written.emails.push(email);
    const handleA = `folda${nonce()}`.toLowerCase().slice(0, 30);
    const handleB = `foldb${nonce()}`.toLowerCase().slice(0, 30);
    written.handles.push(handleA, handleB);

    const first = await post('/auth/sign-up', {
      email,
      password: 'a-long-enough-password',
      handle: handleA,
      displayName: 'Fold',
    });
    expect(first.status).toBe(201);

    const second = await post('/auth/sign-up', {
      email: `  ${local.toUpperCase()}@EXAMPLE.COM  `,
      password: 'a-long-enough-password',
      handle: handleB,
      displayName: 'Fold again',
    });
    expect(second.status).toBeGreaterThanOrEqual(400);
  }, 30_000);
});
