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
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { PersonRepository } from '../src/persistence/person.repository';

const secret = process.env['LOCAL_JWT_SECRET'] ?? 'dev-only-not-a-real-secret';
const issuer = process.env['JWT_ISSUER'] ?? 'sih-local';
const tableName = process.env['TABLE_NAME'] ?? 'sih-main';
const endpoint = process.env['DYNAMO_ENDPOINT'] ?? 'http://127.0.0.1:8000';
const region = process.env['DYNAMO_REGION'] ?? 'local';

async function main(): Promise<void> {
  const userId = `device-${randomUUID()}`;
  const handle = `${process.argv[2] ?? 'device'}${userId.slice(-8)}`.toLowerCase();

  const doc = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      endpoint,
      region,
      credentials: {
        accessKeyId: process.env['S3_ACCESS_KEY_ID'] ?? 'localkey',
        secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'] ?? 'localsecret',
      },
    }),
    { marshallOptions: { removeUndefinedValues: true } },
  );

  await new PersonRepository(doc, tableName).create({
    userId,
    handle,
    displayName: 'Device pass',
    followerCount: 0,
    followingCount: 0,
    interestFollowCount: 0,
    notificationPrefs: { reaction: true, comment: true, follow: true },
    status: 'active',
    createdAt: new Date().toISOString(),
  });

  process.stderr.write(`provisioned ${userId} as @${handle}\n`);
  process.stdout.write(jwt.sign({ sub: userId, operator: false }, secret, { issuer, expiresIn: '2h' }));
}

main().catch((err: unknown) => {
  process.stderr.write(`failed to provision a device identity: ${String(err)}\n`);
  process.exit(1);
});
