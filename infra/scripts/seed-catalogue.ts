import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { env } from './env';

// FR-021: only operators create top-level interests. FR-022 lets anyone create a
// sub-interest, but only beneath an existing top-level parent - so with an empty
// catalogue nothing can be published at all. spec.md Assumptions records this as a
// launch prerequisite, which is why this seed is not optional.
const TOP_LEVEL = [
  'Photography', 'Climbing', 'Cooking', 'Cycling', 'Music', 'Gardening',
  'Woodworking', 'Running', 'Painting', 'Ceramics', 'Birding', 'Travel',
];

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
  const client = new Client({ connectionString: env.postgresUrl });
  await client.connect();
  const now = new Date().toISOString();
  for (const name of TOP_LEVEL) {
    const id = deterministicId(slugify(name));
    const item = {
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
    };

    /**
     * 010. `on conflict do nothing` IS the old `attribute_not_exists(pk)`.
     *
     * Idempotent for the same reason it always was: re-running the seed must
     * not duplicate the catalogue, and the deterministic id above is what makes
     * the guard able to fire at all — a fresh `ulid()` per run would give every
     * item a new primary key and the whole catalogue would double, silently.
     */
    await client.query(
      `insert into items (pk, sk, gsi1pk, gsi1sk, gsi3pk, gsi3sk, item)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict (pk, sk) do nothing`,
      [item.pk, item.sk, item.gsi1pk, item.gsi1sk, item.gsi3pk, item.gsi3sk, JSON.stringify(item)],
    );
  }
  await client.end();
  console.log(`seeded ${TOP_LEVEL.length} top-level interests (idempotent)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
