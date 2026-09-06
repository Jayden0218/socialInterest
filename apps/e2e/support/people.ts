import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { PersonRepository } from '../../api/src/persistence/person.repository';
import { e2eEnv } from './env';

/**
 * Creates the profile row a token needs to be usable.
 *
 * The local profile has no signup endpoint - identity comes from the JWT issuer,
 * and in the aws profile Cognito would provision the profile. So the fixture
 * writes it, reusing the API's OWN repository rather than restating the key
 * schema: a second copy of `USER#<id>` / `#PROFILE` would drift from
 * data-model.md silently and the suite would be exercising a shape the product
 * does not use.
 */
const doc = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    endpoint: e2eEnv.dynamoEndpoint,
    region: e2eEnv.region,
    credentials: e2eEnv.creds,
  }),
  { marshallOptions: { removeUndefinedValues: true } },
);

const people = new PersonRepository(doc, e2eEnv.tableName);

export async function createProfile(userId: string, handle: string): Promise<string> {
  const unique = `${handle}${userId.slice(-8).replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
  await people.create({
    userId,
    handle: unique,
    displayName: handle,
    followerCount: 0,
    followingCount: 0,
    interestFollowCount: 0,
    notificationPrefs: { reaction: true, comment: true, follow: true, message: true },
    status: 'active',
    createdAt: new Date().toISOString(),
  });
  return unique;
}
