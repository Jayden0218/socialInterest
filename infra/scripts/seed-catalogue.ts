import { createHash } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { env } from './env';

// FR-021: only operators create top-level interests. FR-022 lets anyone create a
// sub-interest, but only beneath an existing top-level parent - so with an empty
// catalogue nothing can be published at all. spec.md Assumptions records this as a
// launch prerequisite, which is why this seed is not optional.
const TOP_LEVEL = [
  'Photography', 'Climbing', 'Cooking', 'Cycling', 'Music', 'Gardening',
  'Woodworking', 'Running', 'Painting', 'Ceramics', 'Birding', 'Travel',
];

const doc = DynamoDBDocumentClient.from(
  new DynamoDBClient({ endpoint: env.dynamoEndpoint, region: env.region, credentials: env.creds }),
);

const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const normalise = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Seeded interests need a DETERMINISTIC id. A fresh ulid() per run would give each
// item a new partition key, so the attribute_not_exists guard below could never
// fire and re-running the seed would silently duplicate the whole catalogue.
// Derived from the slug, in ULID's 26-char Crockford base32 shape so the id type
// stays consistent with the ulid()s that sub-interests get at runtime.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const deterministicId = (slug: string): string => {
  const digest = createHash('sha256').update(`interest:${slug}`).digest();
  let out = '';
  for (let i = 0; i < 26; i++) out += CROCKFORD[digest[i]! % 32];
  return out;
};

async function main(): Promise<void> {
  const now = new Date().toISOString();
  for (const name of TOP_LEVEL) {
    const id = deterministicId(slugify(name));
    await doc.send(
      new PutCommand({
        TableName: env.tableName,
        Item: {
          pk: `INTEREST#${id}`,
          sk: '#META',
          type: 'Interest',
          interestId: id,
          name,
          nameNormalised: normalise(name),
          slug: slugify(name),
          level: 'top',
          createdBy: 'SYSTEM',
          postCount: 0,
          followerCount: 0,
          state: 'active',
          createdAt: now,
          gsi1pk: `ISLUG#${slugify(name)}`,
          gsi1sk: '#META',
          gsi3pk: 'PARENT#ROOT',
          gsi3sk: `NAME#${normalise(name)}`,
        },
        // Idempotent: re-running the seed must not duplicate the catalogue.
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    ).catch((e: { name?: string }) => {
      if (e.name !== 'ConditionalCheckFailedException') throw e;
    });
  }
  console.log(`seeded ${TOP_LEVEL.length} top-level interests (idempotent)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
