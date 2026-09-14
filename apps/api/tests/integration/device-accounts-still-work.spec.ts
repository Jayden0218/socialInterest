/**
 * 011/T043, T056. FR-026 — THE ACCOUNTS THE DEVICE PASS DEPENDS ON.
 *
 * Every emulator journey and the whole laptop runbook sign in as an account
 * provisioned by `mint-device-token.ts`. This feature added a way to obtain a
 * credential and must not have changed what an existing one can do — so both
 * halves of FR-026 are asserted, and the second one is a MUST NOT that nothing
 * checked.
 *
 *   1. An account created the old way still works.
 *   2. It is UNREACHABLE through sign-in, which has nothing to check.
 *
 * (2) needs no enforcing — sign-in resolves an account by its credential row and
 * there is none — but a MUST NOT nobody checks is a MUST NOT nobody notices
 * breaking. If somebody later makes sign-in fall back to resolving by handle,
 * this is what says no.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * AND THIS IS THE TEST THE EPOCH WILL BREAK IF US4 GETS IT WRONG
 * ────────────────────────────────────────────────────────────────────────────
 *
 * US4 adds a credential epoch, compared during verification. An account created
 * this way holds NO CREDENTIAL ROW, so there is no epoch to read, and its
 * credentials predate the claim entirely. Fail closed on either absence and
 * every device journey and the laptop runbook sign out in one commit — while
 * protecting nothing, because an account with no password has nothing a reset
 * could revoke.
 *
 * The analysis pass found that the epoch had no defined answer here at all. An
 * absent epoch verifies, on either side, and this is where that is enforced.
 */
import request from 'supertest';
import { ulid } from 'ulid';
import type { Pool } from 'pg';
import { PG_POOL } from '../../src/persistence/pg-pool';
import { PersonRepository } from '../../src/persistence/person.repository';
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

describe('an account created by the device-token tool', () => {
  /** Exactly what `mint-device-token.ts` used to write: a person and nothing else. */
  async function legacyAccount(): Promise<{ userId: string; handle: string; token: string }> {
    const userId = ulid();
    const handle = `legacy${nonce()}`.toLowerCase().slice(0, 30);
    written.push(`HANDLE#${handle}`);
    await h.module.get(PersonRepository).create({
      userId,
      handle,
      displayName: 'Device pass',
      followerCount: 0,
      followingCount: 0,
      interestFollowCount: 0,
      notificationPrefs: { reaction: true, comment: true, follow: true, message: true },
      status: 'active',
      createdAt: new Date().toISOString(),
    });
    return { userId, handle, token: await h.token(userId) };
  }

  it('still works: its credential is accepted on an authenticated route', async () => {
    const account = await legacyAccount();
    const me = await request(h.app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${account.token}`);

    expect(me.status).toBe(200);
    expect(me.body.handle).toBe(account.handle);
  }, 30_000);

  it('holds no credential row, which is why sign-in cannot reach it', async () => {
    const account = await legacyAccount();
    const { rows } = await pool.query<{ n: number }>(
      "select count(*)::int as n from items where item->>'userId' = $1 and sk = '#CREDENTIAL'",
      [account.userId],
    );
    expect(rows[0]!.n).toBe(0);
  }, 30_000);

  it('cannot be signed in to by its handle, or by a handle-shaped address', async () => {
    const account = await legacyAccount();

    /**
     * Both spellings somebody would try, and the refusal must be the ORDINARY
     * one — the same 401 an unknown address gets (FR-009). A distinct error
     * here would say "this account exists but has no password", which is
     * exactly the existence oracle the rest of the feature is hiding.
     */
    for (const email of [account.handle, `${account.handle}@device.local`]) {
      const res = await request(h.app.getHttpServer())
        .post('/v1/auth/sign-in')
        .send({ email, password: 'anything-at-all-here' });
      expect(res.status).toBe(401);
    }
  }, 60_000);
});
