/**
 * Provisions one signed-in identity for a device journey pass and prints its
 * access token on stdout.
 *
 * Two halves, and the second is easy to forget: the local profile has no signup
 * endpoint. Identity comes from the JWT issuer, and the profile row that token
 * refers to has to exist or `GET /v1/me` answers 404 "No such person" - which
 * is what a device would hit on sign-in. In a hosted profile an identity
 * provider would create it; here the harness does, exactly as apps/e2e does.
 *
 * The row is written through the API's OWN repository rather than by restating
 * `USER#<id>` / `#PROFILE` here. A second copy of the key schema would drift
 * from data-model.md silently, and the pass would be exercising a shape the
 * product does not use.
 *
 * Only the token goes to stdout, so a caller can do TOKEN="$(... )". Everything
 * else goes to stderr.
 *
 * Usage: npx tsx apps/api/scripts/mint-device-token.ts [handle]
 */
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { PersonRepository } from '../src/persistence/person.repository';

const secret = process.env['LOCAL_JWT_SECRET'];
if (!secret) {
  process.stderr.write(
    'LOCAL_JWT_SECRET is not set. It has no default any more - the old one was a\n' +
      'constant published in this repository (003/FR-007). Use the same value the\n' +
      'API was started with, or it will reject every token this mints.\n',
  );
  process.exit(2);
}
const issuer = process.env['JWT_ISSUER'] ?? 'sih-local';
const tableName = process.env['TABLE_NAME'] ?? 'items';

// 010. The datastore, and no default: a default connection string is a password
// in the repository, which is 003/FR-007 in a second place.
if (!process.env['DATABASE_URL']) {
  process.stderr.write('DATABASE_URL is not set. Use the value the API was started with.\n');
  process.exit(2);
}

async function main(): Promise<void> {
  const userId = `device-${randomUUID()}`;
  const handle = `${process.argv[2] ?? 'device'}${userId.slice(-8)}`.toLowerCase();

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] ?? '' });

  await new PersonRepository(pool, tableName).create({
    userId,
    handle,
    displayName: 'Device pass',
    followerCount: 0,
    followingCount: 0,
    interestFollowCount: 0,
    notificationPrefs: { reaction: true, comment: true, follow: true, message: true },
    status: 'active',
    createdAt: new Date().toISOString(),
  });

  await pool.end();
  process.stderr.write(`provisioned ${userId} as @${handle}\n`);
  /**
   * TWO HOURS BY DEFAULT, and longer only where something asks for it.
   *
   * Two hours is right for a device pass on a CI runner: the job is twenty-five
   * minutes and a credential that outlives it is a credential printed into a
   * world-readable job summary for longer than it needs to be.
   *
   * It is wrong for a laptop, where the same two hours means signing the phone
   * out over lunch — and the symptom, "the app stopped working", is
   * indistinguishable from the backend being down. `scripts/mint-token.sh`
   * asks for 30 days.
   *
   * The trade is stated rather than hidden: a longer-lived bearer token is a
   * longer window for anyone who gets hold of it. On a home network, for a
   * credential that never leaves it, that is a reasonable trade and it is the
   * owner's to make. It ends when email/password identity lands and a token
   * stops being the thing you carry around.
   */
  const ttl = process.env['TOKEN_TTL'] ?? '2h';
  process.stdout.write(jwt.sign({ sub: userId, operator: false }, secret, { issuer, expiresIn: ttl }));
}

main().catch((err: unknown) => {
  process.stderr.write(`failed to provision a device identity: ${String(err)}\n`);
  process.exit(1);
});
