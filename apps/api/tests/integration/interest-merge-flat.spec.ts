import request from 'supertest';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PG_POOL } from '../../src/persistence/pg-pool';
import { InterestService } from '../../src/modules/interests/interest.service';
import { bootHarness, type Harness } from './harness';

/**
 * 013/T031, T033, T034 — WHAT A MERGE MUST AND MUST NOT DO.
 *
 * The merge machinery predates this feature and already moved posts and
 * followers behind a permanent redirect. What 013 adds is flatness, and three
 * properties that flatness makes newly checkable.
 */
let h: Harness;
let pool: Pool;
let token: string;

const publishNaming = async (name: string) => {
  const res = await request(h.app.getHttpServer())
    .post('/v1/posts')
    .set('authorization', `Bearer ${token}`)
    .send({ uploadIds: [await h.uploadId(token)], interestNames: [name] });
  expect(res.status).toBe(201);
  return {
    postId: res.body.postId as string,
    interestId: (res.body.interestIds as string[])[0]!,
  };
};

beforeAll(async () => {
  h = await bootHarness();
  pool = h.module.get<Pool>(PG_POOL);
  token = await h.token(await h.createPerson('merger'));
}, 120_000);

afterAll(async () => h?.close());

describe('013 — merging two interests that mean one thing', () => {
  /**
   * T031, FR-013. THE MOVED INDEX ROWS MUST CARRY THEIR `visibility`.
   *
   * `postInterestIndex` denormalises visibility so `VisibilityFilter` can run
   * on Query results directly. A merge moves those rows across partitions, and
   * 008 recorded what a drifted index item is: "exactly the SC-009 failure this
   * class exists to make impossible".
   *
   * Asserted on the ROW rather than through a read path, because a read path
   * that happened to re-derive visibility would pass over a drifted row and
   * prove nothing about the field this test is named for.
   */
  it('T031: moved index rows keep their denormalised visibility', async () => {
    const source = `Sourceish ${randomUUID().slice(0, 8)}`;
    const target = `Targetish ${randomUUID().slice(0, 8)}`;
    const a = await publishNaming(source);
    const b = await publishNaming(target);

    const { InterestJobService } = await import('../../src/modules/moderation/interest-job.service');
    const jobs = h.module.get(InterestJobService);
    jobs.startMerge(a.interestId, b.interestId);

    // The job is asynchronous; wait for the row to arrive at the target.
    const deadline = Date.now() + 20_000;
    let rows: { visibility: string | null }[] = [];
    while (Date.now() < deadline) {
      const res = await pool.query<{ visibility: string | null }>(
        "select item->>'visibility' as visibility from items " +
          "where pk = $1 and item->>'postId' = $2 and item->>'type' = 'PostInterestIndex'",
        [`INTEREST#${b.interestId}`, a.postId],
      );
      rows = res.rows;
      if (rows.length > 0) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    expect(rows).toHaveLength(1);
    // The field, not merely the row. A move that dropped it would still arrive.
    expect(rows[0]!.visibility).toBe('public');
  }, 120_000);

  /**
   * T033, FR-015. THE AUTHOR KEEPS THE WORD THEY TYPED.
   *
   * A merge does not rewrite anybody's own post. The post still carries the
   * interest its author chose; reads resolve through the redirect. Rewriting it
   * would file somebody's photograph under a subject they did not choose, which
   * is the imposition this whole feature exists to end.
   */
  it('T033: a merge does not rewrite the interest on an author post', async () => {
    const source = `Keepsake ${randomUUID().slice(0, 8)}`;
    const target = `Survivor ${randomUUID().slice(0, 8)}`;
    const a = await publishNaming(source);
    const b = await publishNaming(target);

    const { InterestJobService } = await import('../../src/modules/moderation/interest-job.service');
    h.module.get(InterestJobService).startMerge(a.interestId, b.interestId);
    await new Promise((r) => setTimeout(r, 1_500));

    const post = await pool.query<{ ids: string }>(
      "select item->>'interestIds' as ids from items where pk = $1 and sk = '#META'",
      [`POST#${a.postId}`],
    );
    expect(JSON.parse(post.rows[0]!.ids)).toContain(a.interestId);
  }, 120_000);

  /**
   * T034, contract §1 row 4. TYPING THE MERGED-AWAY NAME LANDS ON THE SURVIVOR.
   *
   * ────────────────────────────────────────────────────────────────────────
   * AND THE CLAIM ROW IS DELIBERATELY *NOT* RELEASED
   * ────────────────────────────────────────────────────────────────────────
   *
   * The plan expected to release the merged name so it did not stay
   * permanently unusable. Writing the test showed that is the wrong fix and
   * would have been actively worse: `resolveOrPrepare` row 4 already resolves a
   * merged name to its survivor, so the person lands where they meant to. If
   * the claim were released, the next person to type that name would CREATE A
   * NEW INTEREST with it — resurrecting exactly the duplicate the merge was
   * performed to remove.
   *
   * So a releaser with no caller would have been the declared-half-with-no-
   * other-half shape this repository has recorded seven times. It is left
   * unreleased, on purpose, and this is where that is written down.
   */
  it('T034: a name that was merged away resolves to the survivor, not a new interest', async () => {
    const source = `Merged ${randomUUID().slice(0, 8)}`;
    const target = `Winner ${randomUUID().slice(0, 8)}`;
    const a = await publishNaming(source);
    const b = await publishNaming(target);

    const { InterestJobService } = await import('../../src/modules/moderation/interest-job.service');
    h.module.get(InterestJobService).startMerge(a.interestId, b.interestId);
    await new Promise((r) => setTimeout(r, 1_500));
    await h.module.get(InterestService).refreshCatalogue();

    const again = await publishNaming(source);
    expect(again.interestId).toBe(b.interestId);
  }, 120_000);
});
