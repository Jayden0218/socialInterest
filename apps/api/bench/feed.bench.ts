import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { FeedService } from '../src/modules/feed/feed.service';
import { RankingService } from '../src/modules/ranking/ranking.service';
import { PersonFollowService } from '../src/modules/people/person-follow.service';
import { PG_POOL } from '../src/persistence/pg-pool';
import { CONFIG, type AppConfig } from '../src/config/configuration';
import { percentiles, report, timed, type Percentiles } from './harness';

/**
 * 001/SC-005 and 007/SC-012: first content within 2s at p95.
 *
 * Reported BROKEN DOWN BY FOLLOW COUNT, not as a single headline number.
 * Research D1 accepts that read-time assembly scales with how many interests a
 * person follows, so the shape of that curve IS the finding - a healthy average
 * across a population that mostly follows five interests would hide a
 * 200-follow user sitting well over budget, and 200 is the cap the product
 * actually permits.
 *
 * Run: pnpm --filter @sih/infra seed:load && pnpm --filter @sih/api bench:feed
 */
const BUDGET_MS = 2000;
const ITERATIONS = 25;

/**
 * 007/SC-012, T070a — WHAT THE RANKING ITSELF COSTS.
 *
 * The headline number cannot answer the question 007 raises. A ranked feed
 * reads across the catalogue instead of a subscription list, so "is the feed
 * still under 2 seconds" and "how much of that is the ranker" are different
 * questions, and only the second one says whether the design has headroom.
 *
 * So each sample is taken TWICE against the same viewer: once for the whole
 * request, and once for `RankingService.rank` alone. The difference is
 * everything after the proposal — the visibility boundary, the author reads and
 * the hydration — which is the part 001 already measured.
 *
 * Reported as its own row rather than folded in, because a ranker that doubles
 * while the total stays inside budget is a finding, not a non-event: it is the
 * headroom being spent.
 */
/** Groups seeded people by their follow count, so the curve can be reported. */
async function bucketUsersByFollowCount(pool: Pool): Promise<Map<number, string[]>> {
  /**
   * 010. WAS A PAGED `Scan` WITH A FILTER; is one statement now.
   *
   * The old engine had no way to ask "every item of this type" except to read
   * the whole table and discard most of it, a page at a time. This is the same
   * question asked once. It is a bench rather than a read path, so it was never
   * a correctness problem — but it is a fair illustration of what the engine
   * change buys where a question does not fit a key.
   */
  const { rows } = await pool.query<{ userid: string }>(
    `select item->>'userId' as userid from items where item->>'type' = 'InterestFollow'`,
  );

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.userid) counts.set(row.userid, (counts.get(row.userid) ?? 0) + 1);
  }

  const buckets = new Map<number, string[]>();
  for (const [userId, count] of counts) {
    const bucket = buckets.get(count) ?? [];
    bucket.push(userId);
    buckets.set(count, bucket);
  }
  return buckets;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const feed = app.get(FeedService);
  const pool = app.get<Pool>(PG_POOL);
  const config = app.get<AppConfig>(CONFIG);

  const buckets = await bucketUsersByFollowCount(pool);
  if (buckets.size === 0) {
    console.log('\nNo seeded follows found. Run: pnpm --filter @sih/infra seed:load\n');
    await app.close();
    return;
  }

  const ranking = app.get(RankingService);
  const follows = app.get(PersonFollowService);

  const rows: Percentiles[] = [];
  const rankRows: Percentiles[] = [];
  for (const [followCount, ids] of buckets) {
    const samples: number[] = [];
    const rankSamples: number[] = [];
    let widthSeen = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const userId = ids[i % ids.length]!;
      samples.push(
        await timed(async () => {
          const page = await feed.homeFeed({ userId }, { limit: 20 });
          widthSeen = page.fanOutWidth;
        }),
      );
      // The proposal alone, for the same viewer, immediately after. Same
      // partitions, same warmth of cache: the difference is the boundary and
      // the hydration rather than a different machine state.
      const followed = await follows.followedAuthorIds(userId);
      rankSamples.push(await timed(() => ranking.rank(userId, 20, followed)));
    }
    // Label carries the fan-out width, since that is the mechanism behind the curve.
    rows.push(percentiles(`follows ${followCount} (fan-in ${widthSeen})`, samples));
    rankRows.push(percentiles(`follows ${followCount} — ranking only`, rankSamples));
  }

  const ok = report('bench:feed — SC-005/SC-012 home feed latency by follow count', BUDGET_MS, rows);
  console.log('  Watch the CURVE, not the headline: research D1 accepts that this');
  console.log('  scales with follow count, and 200 is the cap the product permits.\n');

  /**
   * The ranker's own share, against the SAME budget so the two tables are
   * directly comparable. It is not a separate criterion — SC-012 is about the
   * first screen — but a ranker at 90% of the budget and a ranker at 5% are
   * different products, and the headline cannot tell them apart.
   */
  report('bench:feed — 007/SC-012 the ranking\'s own share of that time', BUDGET_MS, rankRows);
  console.log('  Everything the first table measures beyond this row is the');
  console.log('  visibility boundary and the hydration - the part 001 measured.\n');
  await app.close();
  if (!ok) process.exit(1);
}

void main();
