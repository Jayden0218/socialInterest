import { Pool } from 'pg';
import { ulid } from 'ulid';
import { env } from './env';

/**
 * Load data for the benchmarks. Shapes matter more than volume: the feed's cost
 * scales with how many interests a person follows (research D1), so the seeder
 * produces a realistic spread of follow counts rather than giving everyone the
 * same number.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * 010/013: THIS WAS STALE IN TWO DIRECTIONS AT ONCE
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * It wrote to DynamoDB Local with `BatchWriteCommand` (010 moved the datastore
 * to Postgres) AND it built a HIERARCHY — it queried `gsi3` for `PARENT#ROOT`,
 * refused to run without a top-level interest, and gave every seeded interest a
 * `level: 'sub'`, a `parentId` and a `gsi3` pair. 013 deleted all of that: an
 * interest is flat, named freely on a publish, and there is no parent index left
 * to attach to. So it could not have run, and if it had it would have seeded
 * rows in a shape nothing reads.
 *
 * Its own header comment records the first version timing an EMPTY FEED and
 * "reporting comfortable numbers for no work at all", because the bench
 * interests were unreachable from the catalogue walk. That is the risk this file
 * carries by writing rows directly rather than publishing through the API — the
 * shapes below have to match what the repositories read, and nothing checks
 * that for you. `bench:feed-load` prints the fan-in it measured for exactly this
 * reason: a zero there means this seeder, not the design.
 *
 * KEY COLUMNS, NOT ONLY `item`. On Postgres `pk`, `sk` and the five index pairs
 * are COLUMNS, and every query reads the columns. Writing them into the JSONB
 * body alone produces rows that exist and are invisible to every index — which
 * is a defect this project has already paid for once, in `runUpdate`.
 */
const arg = (name: string, fallback: number): number => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

/**
 * IT WRITES INTO THE SAME TABLE EVERY SUITE USES, and there is no isolation.
 *
 * A small run — 200 posts, 30 people, 20 interests — was enough to turn
 * `008/US13 FR-043` red in the API suite while it passed alone. That is this
 * project's most-repeated false regression (a bounded page over a grown table,
 * four previous occurrences, every one first diagnosed as a product defect) and
 * this script is the fastest way to cause it. `db:create-local-pg --recreate`
 * afterwards, and count the rows before believing a paging failure.
 */
const POSTS = arg('posts', 100_000);
const INTERESTS = arg('interests', 5_000);
const PEOPLE = arg('people', 10_000);
/** Follow counts to bucket people into, spanning the 200 cap. */
const FOLLOW_BUCKETS = [1, 5, 20, 50, 100, 200];

const pool = new Pool({ connectionString: env.postgresUrl });

/** The columns a row can carry, in the order the insert below binds them. */
const COLUMNS = [
  'pk', 'sk',
  'gsi1pk', 'gsi1sk', 'gsi2pk', 'gsi2sk', 'gsi3pk', 'gsi3sk',
  'gsi4pk', 'gsi4sk', 'gsi5pk', 'gsi5sk',
] as const;

type Row = Record<string, unknown>;

/**
 * One multi-row `insert` per chunk. 500 rows is 6,500 bind parameters, well
 * inside Postgres's 65,535 limit and far fewer round trips than a row at a time
 * — a 100,000-post run is 200,000 rows.
 */
async function writeAll(items: Row[]): Promise<void> {
  const CHUNK = 500;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const params: unknown[] = [];
    const values = chunk.map((row) => {
      const placeholders = COLUMNS.map((c) => {
        params.push(row[c] ?? null);
        return `$${params.length}`;
      });
      params.push(JSON.stringify(row));
      placeholders.push(`$${params.length}`);
      return `(${placeholders.join(', ')})`;
    });
    await pool.query(
      `insert into items (${COLUMNS.join(', ')}, item) values ${values.join(', ')}
         on conflict (pk, sk) do nothing`,
      params,
    );
  }
}

async function main(): Promise<void> {
  console.log(`seeding ${PEOPLE} people, ${INTERESTS} interests, ${POSTS} posts...`);
  const now = new Date().toISOString();

  /**
   * FLAT (013). No parent, no `level`, no `gsi3` pair — an interest is a name
   * somebody used on a post. `gsi1` is the slug lookup and is what makes these
   * reachable by `InterestRepository`.
   */
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
      createdBy: 'BENCH',
      postCount: 0,
      followerCount: 0,
      state: 'active',
      createdAt: now,
      gsi1pk: `ISLUG#bench-${i}`,
      gsi1sk: '#META',
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
      notificationPrefs: { reaction: true, comment: true, follow: true, message: true },
      status: 'active',
      createdAt: now,
      gsi1pk: `HANDLE#bench${i}`,
      gsi1sk: '#PROFILE',
    })),
  );

  // Posts, plus one index item each so interest listings and the feed have
  // something to read.
  const postItems: Row[] = [];
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
  const followItems: Row[] = [];
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
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
