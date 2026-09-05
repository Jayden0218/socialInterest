import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { env } from './env';

/**
 * Load data for the benchmarks. Shapes matter more than volume: the feed's cost
 * scales with how many interests a person follows (research D1), so the seeder
 * produces a realistic spread of follow counts rather than giving everyone the
 * same number.
 */
const arg = (name: string, fallback: number): number => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

const POSTS = arg('posts', 100_000);
const INTERESTS = arg('interests', 5_000);
const PEOPLE = arg('people', 10_000);
/** Follow counts to bucket people into, spanning the 200 cap. */
const FOLLOW_BUCKETS = [1, 5, 20, 50, 100, 200];

const doc = DynamoDBDocumentClient.from(
  new DynamoDBClient({ endpoint: env.dynamoEndpoint, region: env.region, credentials: env.creds }),
);

async function writeAll(items: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < items.length; i += 25) {
    await doc.send(
      new BatchWriteCommand({
        RequestItems: { [env.tableName]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) },
      }),
    );
  }
}

async function main(): Promise<void> {
  console.log(`seeding ${PEOPLE} people, ${INTERESTS} interests, ${POSTS} posts...`);
  const now = new Date().toISOString();

  const interestIds = Array.from({ length: INTERESTS }, () => ulid());
  await writeAll(
    interestIds.map((id, i) => ({
      pk: `INTEREST#${id}`,
      sk: '#META',
      type: 'Interest',
      interestId: id,
      name: `Bench ${i}`,
      nameNormalised: `bench ${i}`,
      slug: `bench-${i}`,
      level: 'sub',
      parentId: interestIds[0],
      createdBy: 'BENCH',
      postCount: 0,
      followerCount: 0,
      state: 'active',
      createdAt: now,
      gsi1pk: `ISLUG#bench-${i}`,
      gsi1sk: '#META',
      gsi3pk: `PARENT#${interestIds[0]}`,
      gsi3sk: `NAME#bench ${i}`,
    })),
  );

  const peopleIds = Array.from({ length: PEOPLE }, () => ulid());
  await writeAll(
    peopleIds.map((id, i) => ({
      pk: `USER#${id}`,
      sk: '#PROFILE',
      type: 'Person',
      userId: id,
      handle: `bench${i}`,
      displayName: `Bench ${i}`,
      followerCount: 0,
      followingCount: 0,
      interestFollowCount: 0,
      notificationPrefs: { reaction: true, comment: true, follow: true },
      status: 'active',
      createdAt: now,
      gsi1pk: `HANDLE#bench${i}`,
      gsi1sk: '#PROFILE',
    })),
  );

  // Posts, plus one index item each so interest listings and the feed have
  // something to read.
  const postItems: Record<string, unknown>[] = [];
  for (let i = 0; i < POSTS; i++) {
    const postId = ulid();
    const authorId = peopleIds[i % peopleIds.length]!;
    const interestId = interestIds[i % interestIds.length]!;
    const createdAt = new Date(Date.now() - i * 1000).toISOString();
    postItems.push(
      {
        pk: `POST#${postId}`, sk: '#META', type: 'Post', postId, authorId,
        interestIds: [interestId], visibility: 'public', processingState: 'ready',
        mediaKind: 'images', reactionCount: 0, commentCount: 0, createdAt, updatedAt: createdAt,
        gsi2pk: `USER#${authorId}`, gsi2sk: `TS#${createdAt}#${postId}`,
      },
      {
        pk: `INTEREST#${interestId}`, sk: `POST#${createdAt}#${postId}`,
        type: 'PostInterestIndex', postId, authorId, interestId,
        visibility: 'public', processingState: 'ready', createdAt,
      },
    );
  }
  await writeAll(postItems);

  // Follows, bucketed so bench:feed can report p95 BY follow count.
  const followItems: Record<string, unknown>[] = [];
  peopleIds.forEach((userId, i) => {
    const count = FOLLOW_BUCKETS[i % FOLLOW_BUCKETS.length]!;
    for (let f = 0; f < count; f++) {
      const interestId = interestIds[(i + f) % interestIds.length]!;
      followItems.push({
        pk: `USER#${userId}`, sk: `IFOLLOW#${interestId}`, type: 'InterestFollow',
        userId, interestId, followedAt: now,
        gsi4pk: `INTEREST#${interestId}`, gsi4sk: `IFOLLOWER#${userId}`,
      });
    }
  });
  await writeAll(followItems);

  console.log(`done: ${interestIds.length} interests, ${peopleIds.length} people, ${POSTS} posts`);
  console.log(`follow buckets: ${FOLLOW_BUCKETS.join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
