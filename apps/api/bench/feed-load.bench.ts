import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AppModule } from '../src/app.module';
import { FeedService } from '../src/modules/feed/feed.service';
import { DOC_CLIENT } from '../src/persistence/dynamo-client';
import { CONFIG, type AppConfig } from '../src/config/configuration';
import { percentiles, report, timed } from './harness';

/**
 * SC-011: 10,000 people browsing concurrently without a noticeable slowdown.
 *
 * Distinct from bench:feed, which measures latency AT REST. This measures it
 * UNDER LOAD, and the gap between the two is the finding: read-time fan-in
 * (research D1) multiplies concurrency by follow count at the datastore, so a
 * feed that is comfortable when idle can still fall over when 10,000 people
 * open the app at once.
 *
 * This is the criterion most likely to invalidate the D1 bet. If it does, the
 * migration path is already recorded there: materialise timelines for the
 * high-volume interests only, keeping read-time assembly - and read-time
 * visibility filtering - for the tail.
 *
 * Concurrency is scaled with --concurrency; the default is modest so the bench
 * runs on a laptop, and the point is the SHAPE of the curve as it rises.
 */
const BUDGET_MS = 2000;
const arg = (name: string, fallback: number): number => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

const TARGET = arg('concurrency', 200);
const LEVELS = [1, 10, 50, 100, TARGET].filter((n, i, a) => a.indexOf(n) === i && n <= TARGET);
const REQUESTS_PER_LEVEL = 200;

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const feed = app.get(FeedService);
  const doc = app.get<DynamoDBDocumentClient>(DOC_CLIENT);
  const config = app.get<AppConfig>(CONFIG);

  const scan = await doc.send(
    new ScanCommand({
      TableName: config.dynamo.tableName,
      FilterExpression: '#t = :t',
      ExpressionAttributeNames: { '#t': 'type' },
      ExpressionAttributeValues: { ':t': 'InterestFollow' },
      ProjectionExpression: 'userId',
      Limit: 2000,
    }),
  );
  const userIds = [...new Set((scan.Items ?? []).map((i) => i['userId'] as string))];
  if (userIds.length === 0) {
    console.log('\nNo seeded follows found. Run: pnpm --filter @sih/infra seed:load\n');
    await app.close();
    return;
  }

  const rows = [];
  for (const concurrency of LEVELS) {
    const samples: number[] = [];
    let issued = 0;
    while (issued < REQUESTS_PER_LEVEL) {
      const batch = Math.min(concurrency, REQUESTS_PER_LEVEL - issued);
      const results = await Promise.all(
        Array.from({ length: batch }, (_, i) => {
          const userId = userIds[(issued + i) % userIds.length]!;
          return timed(() => feed.homeFeed({ userId }, { limit: 20 }));
        }),
      );
      samples.push(...results);
      issued += batch;
    }
    rows.push(percentiles(`concurrency ${concurrency}`, samples));
  }

  const ok = report('bench:feed-load — SC-011 feed latency UNDER LOAD', BUDGET_MS, rows);
  console.log('  Compare against bench:feed (at rest). A widening gap means the');
  console.log('  read-time fan-in bet in research D1 needs revisiting.\n');
  await app.close();
  if (!ok) process.exit(1);
}

void main();
