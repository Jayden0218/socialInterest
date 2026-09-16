import request from 'supertest';
import type { Pool } from 'pg';
import { PG_POOL } from '../../src/persistence/pg-pool';
import { normaliseName } from '../../src/modules/interests/normalise-name';
import { bootHarness, type Harness } from './harness';

/**
 * 013/T016, contract §1. NAMING AN INTEREST WHILE PUBLISHING.
 *
 * The resolution table is the feature. Each row below is a branch a person can
 * reach by typing, and the two that matter most are the ones that look like
 * nothing happening:
 *
 *   row 3 — the name already exists, so they JOIN it and are asked nothing.
 *           This is what the owner asked for when they said near-duplicates
 *           should converge "like in internet search": "Bouldering",
 *           "bouldering" and "  BOULDERING!! " are ONE interest that was never
 *           duplicated, so there is nothing to merge afterwards.
 *   row 1 — the name normalises to nothing, and publishing is refused rather
 *           than producing a nameless interest.
 *
 * Counted in the TABLE rather than through the catalogue, for the reason
 * 011 gave: asking the cache how many interests hold a name is asking the
 * component under suspicion to testify, and `findExact` returns at most one by
 * construction.
 */
let h: Harness;
let pool: Pool;
let token: string;

const holdersOf = async (name: string): Promise<number> => {
  const res = await pool.query(
    "select count(*)::int as n from items where item->>'type' = 'Interest' and item->>'nameNormalised' = $1",
    [normaliseName(name)],
  );
  return res.rows[0].n as number;
};

const publishNaming = async (...interestNames: string[]) =>
  request(h.app.getHttpServer())
    .post('/v1/posts')
    .set('authorization', `Bearer ${token}`)
    .send({ uploadIds: [await h.uploadId(token)], interestNames });

beforeAll(async () => {
  h = await bootHarness();
  pool = h.module.get<Pool>(PG_POOL);
  token = await h.token(await h.createPerson('namer'));
}, 120_000);

afterAll(async () => h?.close());

describe('013/contract §1 — naming an interest while publishing', () => {
  it('row 7: a name nobody has used creates the interest, with the post as its first', async () => {
    const name = `Kitesurfing ${Math.random().toString(36).slice(2, 8)}`;
    const res = await publishNaming(name);

    expect(res.status).toBe(201);
    expect(await holdersOf(name)).toBe(1);
    // FR-004: born with a post, never empty.
    const row = await pool.query(
      "select item->>'postCount' as n from items where item->>'type' = 'Interest' and item->>'nameNormalised' = $1",
      [normaliseName(name)],
    );
    expect(Number(row.rows[0].n)).toBeGreaterThanOrEqual(1);
  }, 90_000);

  it('row 3: case, punctuation and spacing converge on ONE interest', async () => {
    const base = `Bouldering ${Math.random().toString(36).slice(2, 8)}`;
    /**
     * GENERATED FROM THE BASE, not three hand-picked spellings. A hand-picked
     * list only covers the variants somebody already thought of — which is how
     * 004's first `auth-surface` guard missed the second occurrence of the very
     * defect it was written for.
     */
    const variants = [
      base,
      base.toLowerCase(),
      base.toUpperCase(),
      `  ${base}!!  `,
      base.replace(' ', '   '),
      `${base}.`,
    ];

    for (const v of variants) {
      const res = await publishNaming(v);
      expect([201, 422]).toContain(res.status);
      expect(res.status).toBe(201);
    }

    expect(await holdersOf(base)).toBe(1);
  }, 120_000);

  it('row 1: a name with nothing in it is refused, and creates nothing', async () => {
    const before = await pool.query(
      "select count(*)::int as n from items where item->>'type' = 'Interest'",
    );
    const res = await publishNaming('!!!  ...  ');

    expect(res.status).toBe(422);
    const after = await pool.query(
      "select count(*)::int as n from items where item->>'type' = 'Interest'",
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  }, 90_000);

  it('FR-005: publishing with neither a name nor an id is refused', async () => {
    const res = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({ uploadIds: [await h.uploadId(token)] });

    expect(res.status).toBe(422);
  }, 90_000);

  /**
   * 013/T015, FR-004. AN INTEREST CANNOT OUTLIVE A POST THAT NEVER ARRIVED.
   *
   * The publish is made to fail AFTER the name has been resolved as new — an
   * upload id belonging to somebody else, which the server refuses from its own
   * record. One transaction, so the interest rolls back with the post. Two
   * requests would leave it behind for ever, which is the window this shape
   * exists to close.
   */
  it('T015: a publish that fails creates no interest', async () => {
    const other = await h.token(await h.createPerson('otherperson'));
    const name = `Orphaned ${Math.random().toString(36).slice(2, 8)}`;

    const res = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      // An upload issued to somebody else: refused, after the name is resolved.
      .send({ uploadIds: [await h.uploadId(other)], interestNames: [name] });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await holdersOf(name)).toBe(0);
  }, 90_000);
});
