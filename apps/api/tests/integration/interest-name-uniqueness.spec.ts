/**
 * 013/T001. TWO PEOPLE MUST NOT BE ABLE TO CREATE ONE INTEREST.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THIS TEST IS WATCHED RED AGAINST THE SHIPPED PRODUCT, AND THE NUMBER MATTERS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Research R1 established by reading the code what 011 established by running
 * it, and the shape is identical: `InterestRepository.createSubInterest` guards
 * on `attribute_not_exists(pk)` where `pk` is `INTEREST#<interestId>` — a fresh
 * ULID on every call — so the condition CAN NEVER FIRE FOR A NAME.
 *
 * What prevents a duplicate today is `findExact` in `interest.service`, which is
 * a READ-THEN-WRITE. And here it is worse than in 011: that read goes to
 * `CatalogueCache`, an in-memory PER-PROCESS cache refreshed after a write. Two
 * API processes do not see each other's interests until a refresh, so the window
 * is not scheduling microseconds — it is however long the other cache is stale.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THE COUNT DECIDES THE DIAGNOSIS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 011: "A read-then-write would produce an occasional 2; this produced a
 * reliable 8 — there was no race to lose, because there was no constraint — and
 * a fix aimed at narrowing a window would have looked like progress against the
 * wrong diagnosis."
 *
 * So this file does not merely assert 1. It REPORTS the number it saw, because
 * before the fix the number is the finding.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * AND WHY THE BATCH IS SIZED THE WAY IT IS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 011's concurrency test would have passed for the wrong reason: six sign-ups
 * against a route with capacity five meant five were refused 429 by the RATE
 * LIMITER without ever reaching the constraint — delete the constraint and it
 * still passed. This drives the service directly rather than the HTTP route, so
 * no limiter is in the path at all, and that is stated rather than assumed.
 */
import type { Pool } from 'pg';
import { InterestService } from '../../src/modules/interests/interest.service';
import { InterestRepository } from '../../src/persistence/interest.repository';
import { InMemoryCatalogueCache, normaliseName } from '../../src/modules/interests/catalogue.cache';
import { PG_POOL } from '../../src/persistence/pg-pool';
import { bootHarness, type Harness } from './harness';

let h: Harness;
let interests: InterestService;
let repo: InterestRepository;
let cache: InMemoryCatalogueCache;
let pool: Pool;

/**
 * COUNTED IN THE TABLE, not through the catalogue.
 *
 * The cache is the thing under suspicion — asking it how many interests hold a
 * name is asking the suspect to testify. `findExact` returns at most one by
 * construction and would answer "one" against the very defect this file exists
 * for. The count has to come from underneath.
 */
const holdersOf = async (nameNormalised: string): Promise<number> => {
  const res = await pool.query(
    // `type` lives INSIDE the jsonb document, not as a column. The single table
    // has only key columns plus `item`.
    "select count(*)::int as n from items where item->>'type' = 'Interest' and item->>'nameNormalised' = $1",
    [nameNormalised],
  );
  return res.rows[0].n as number;
};

beforeAll(async () => {
  h = await bootHarness();
  interests = h.module.get(InterestService);
  repo = h.module.get(InterestRepository);
  cache = h.module.get(InMemoryCatalogueCache);
  pool = h.module.get<Pool>(PG_POOL);
}, 120_000);

afterAll(async () => {
  await h?.close();
});

describe('013/SC-004 — one interest per name, under concurrency', () => {
  it('N simultaneous creations of one name produce exactly one interest', async () => {
    const creator = await h.createPerson(`namer${Math.random().toString(36).slice(2, 7)}`);
    // Unique per run: the local table is shared across runs, and this project
    // has three recorded "regressions" that were a grown table.
    const name = `Concurrent ${Math.random().toString(36).slice(2, 9)}`;

    await cache.refresh();

    const ATTEMPTS = 8;
    /**
     * 013. Driven through `resolveOrPrepare` + the repository's transactional
     * `create`, which is the path publishing takes — `createSubInterest` and
     * `POST /v1/interests` are gone (FR-004: an interest is born with a post).
     *
     * Still the SERVICE and not the HTTP route, so no rate limiter is in the
     * path at all: 011's concurrency test would otherwise have passed for the
     * wrong reason, with most attempts refused 429 before reaching the
     * constraint.
     */
    const results = await Promise.allSettled(
      Array.from({ length: ATTEMPTS }, async () => {
        const { interest, items } = await interests.resolveOrPrepare(name, creator);
        if (items.length === 0) return interest;
        await repo.create(interest);
        return interest;
      }),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const holders = await holdersOf(normaliseName(name));

    // The number IS the finding before the fix. Printed, not only asserted.
    console.log(
      `013/T001: ${ATTEMPTS} simultaneous creations of one name -> ` +
        `${succeeded} accepted, ${holders} interests in the table`,
    );

    expect(holders).toBe(1);
    expect(succeeded).toBe(1);
  }, 120_000);
});
