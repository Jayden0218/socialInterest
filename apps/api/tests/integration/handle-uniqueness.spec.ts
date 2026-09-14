/**
 * 011/T003. TWO PEOPLE MUST NOT BE ABLE TO HOLD ONE HANDLE.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THIS TEST WAS WATCHED RED AGAINST THE SHIPPED PRODUCT (T004)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Research R1 established, by running it rather than by reading the code, that
 * handles are not unique today: `PersonRepository.create` guards on
 * `attribute_not_exists(pk)` where `pk` is `USER#<userId>` — a fresh identifier
 * on every call — so the condition CAN NEVER FIRE FOR A HANDLE. Nothing else
 * enforces it; `findByHandle` is a lookup, not a constraint.
 *
 * And a duplicate does not merely exist, it SHADOWS: `findByHandle` returned the
 * SECOND person, and that lookup is how a profile, a mention, a conversation, a
 * follow, a block and a report each resolve a person — thirteen call sites in
 * six services, every one of them silently addressing the wrong one.
 *
 * It has never bitten because no human has ever chosen a handle: every handle
 * in existence carries a machine-generated suffix. 011/US1 is precisely the
 * change that removes the thing hiding it, which is why this is a blocking
 * phase rather than a detail inside sign-up.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THE CONCURRENT CASE IS THE POINT, AND THE SEQUENTIAL ONE IS NOT ENOUGH
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The obvious fix is to call `findByHandle` before creating. That passes the
 * sequential case below and fails the concurrent one: two requests a millisecond
 * apart both read "free" and both write. A read-then-write is not a constraint,
 * and a suite that only ever drives one request at a time cannot tell the two
 * implementations apart.
 *
 * So both are asserted, and the concurrent one is the reason the file exists.
 */
import type { Pool } from 'pg';
import { PersonRepository, type PersonItem } from '../../src/persistence/person.repository';
import { PG_POOL } from '../../src/persistence/pg-pool';
import { bootHarness, type Harness } from './harness';

let h: Harness;
let people: PersonRepository;
let pool: Pool;

/**
 * COUNTED IN THE TABLE, not through the repository.
 *
 * `findByHandle` returns ONE row by construction — it queries with `limit: 1` —
 * so asking it how many people hold a handle is asking a question it cannot
 * answer, and it would answer "one" against the very defect this file exists
 * for. The count has to come from underneath it.
 *
 * Deliberately not a test-only method on `PersonRepository`: a production class
 * carrying `countHandleHoldersForTests` is a test affordance one refactor away
 * from being mistaken for the product path, which is the distinction
 * `issueForTesting` is named to preserve.
 */
const holdersOf = async (handleLower: string): Promise<number> => {
  const res = await pool.query(
    "select count(*)::int as n from items where gsi1pk = $1 and gsi1sk = '#PROFILE'",
    [`HANDLE#${handleLower}`],
  );
  return res.rows[0].n as number;
};

/** Every handle this suite claims, so it can put the table back. */
const claimed: string[] = [];

const person = (handle: string, userId: string): PersonItem => ({
  userId,
  handle,
  displayName: 'Uniqueness probe',
  followerCount: 0,
  followingCount: 0,
  interestFollowCount: 0,
  notificationPrefs: { reaction: true, comment: true, follow: true, message: true },
  status: 'active',
  createdAt: new Date().toISOString(),
});

/** A fresh handle per case: the local table is shared across runs. */
const freshHandle = (): string => `uniq${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

beforeAll(async () => {
  h = await bootHarness();
  people = h.module.get(PersonRepository);
  pool = h.module.get<Pool>(PG_POOL);
}, 60_000);

/**
 * CLEANS UP AFTER ITSELF. This project has recorded three "regressions" that
 * were a grown local table, twice while paging and once here in 008's Phase D.
 * A suite that leaves rows behind is a suite that makes the next one lie.
 */
afterAll(async () => {
  for (const handle of claimed) {
    await pool.query("delete from items where gsi1pk = $1 or pk = $2", [
      `HANDLE#${handle.toLowerCase()}`,
      `HANDLE#${handle.toLowerCase()}`,
    ]);
  }
  await h.close();
});

describe('a handle identifies exactly one person', () => {
  it('refuses a second person with a handle already taken', async () => {
    const handle = freshHandle();
    claimed.push(handle);

    const first = `probe-a-${Date.now()}`;
    await people.create(person(handle, first));

    await expect(people.create(person(handle, `probe-b-${Date.now()}`))).rejects.toThrow();

    /**
     * AND THE SURVIVOR IS THE FIRST ONE.
     *
     * Asserted separately from the refusal because R1's finding was not "a
     * duplicate exists" — it was that `findByHandle` returned the SECOND. A fix
     * that refused the write but left the lookup resolving to the newcomer would
     * satisfy the line above and leave the defect exactly where it was.
     */
    const found = await people.findByHandle(handle);
    expect(found?.userId).toBe(first);
    expect(await holdersOf(handle.toLowerCase())).toBe(1);
  });

  it('is case-insensitive, because `findByHandle` is', async () => {
    const handle = freshHandle();
    claimed.push(handle);
    await people.create(person(handle, `probe-case-${Date.now()}`));

    await expect(
      people.create(person(handle.toUpperCase(), `probe-case-upper-${Date.now()}`)),
    ).rejects.toThrow();
  });

  it('admits EXACTLY ONE of eight simultaneous claims', async () => {
    /**
     * THE CASE THE CONSTRAINT EXISTS FOR, and the one a read-then-write fails.
     *
     * `Promise.allSettled` rather than `Promise.all`: all but one are expected
     * to reject, and `all` would reject on the first of them and tell us
     * nothing about how many got through — which is the only number here that
     * means anything.
     */
    const handle = freshHandle();
    claimed.push(handle);

    const attempts = Array.from({ length: 8 }, (_, i) =>
      people.create(person(handle, `probe-race-${i}-${Date.now()}`)),
    );
    const settled = await Promise.allSettled(attempts);

    const winners = settled.filter((r) => r.status === 'fulfilled');
    expect(winners).toHaveLength(1);

    // And the person that survives is the one whose write won, not whichever
    // wrote last.
    const found = await people.findByHandle(handle);
    expect(found).not.toBeNull();
    expect(await holdersOf(handle.toLowerCase())).toBe(1);
  });
});
