import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AppModule } from '../src/app.module';
import { FeedService } from '../src/modules/feed/feed.service';
import { DOC_CLIENT } from '../src/persistence/dynamo-client';
import { CONFIG, type AppConfig } from '../src/config/configuration';
import { percentiles, report, timed, type Percentiles } from './harness';

/**
 * SC-005: first content within 2s at p95.
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

/** Groups seeded people by their follow count, so the curve can be reported. */
async function bucketUsersByFollowCount(
  doc: DynamoDBDocumentClient,
  tableName: string,
): Promise<Map<number, string[]>> {
  const counts = new Map<string, number>();
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: '#t = :t',
        ExpressionAttributeNames: { '#t': 'type' },
        ExpressionAttributeValues: { ':t': 'InterestFollow' },
        ProjectionExpression: 'userId',
        ExclusiveStartKey: cursor,
      }),
    );
    for (const item of page.Items ?? []) {
      const userId = item['userId'] as string;
      counts.set(userId, (counts.get(userId) ?? 0) + 1);
    }
    cursor = page.LastEvaluatedKey;
  } while (cursor);

  const buckets = new Map<number, string[]>();
  for (const [userId, count] of counts) {
    buckets.set(count, [...(buckets.get(count) ?? []), userId]);
  }
  return new Map([...buckets.entries()].sort((a, b) => a[0] - b[0]));
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const feed = app.get(FeedService);
  const doc = app.get<DynamoDBDocumentClient>(DOC_CLIENT);
  const config = app.get<AppConfig>(CONFIG);

  const buckets = await bucketUsersByFollowCount(doc, config.dynamo.tableName);
  if (buckets.size === 0) {
    console.log('\nNo seeded follows found. Run: pnpm --filter @sih/infra seed:load\n');
    await app.close();
    return;
  }

  const rows: Percentiles[] = [];
  for (const [followCount, ids] of buckets) {
    const samples: number[] = [];
    let widthSeen = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const userId = ids[i % ids.length]!;
      samples.push(
        await timed(async () => {
          const page = await feed.homeFeed({ userId }, { limit: 20 });
          widthSeen = page.fanOutWidth;
        }),
      );
    }
    // Label carries the fan-out width, since that is the mechanism behind the curve.
    rows.push(percentiles(`follows ${followCount} (fan-in ${widthSeen})`, samples));
  }

  const ok = report('bench:feed — SC-005 home feed latency by follow count', BUDGET_MS, rows);
  console.log('  Watch the CURVE, not the headline: research D1 accepts that this');
  console.log('  scales with follow count, and 200 is the cap the product permits.\n');
  await app.close();
  if (!ok) process.exit(1);
}

void main();
