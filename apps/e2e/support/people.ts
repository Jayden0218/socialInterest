import { Pool } from 'pg';
import { PersonRepository } from '../../api/src/persistence/person.repository';
import { CredentialRepository } from '../../api/src/persistence/credential.repository';
import { derivePassword } from '../../api/src/modules/auth/password';
import { randomBytes } from 'node:crypto';
import { e2eEnv } from './env';

/**
 * Creates the profile row a token needs to be usable.
 *
 * 011 ADDED A SIGNUP ENDPOINT, and this comment used to say there was none.
 * The fixtures deliberately still write the row directly: they are provisioning
 * a known starting state, not exercising sign-up, and driving four actors
 * through `POST /auth/sign-up` would make every fixture depend on a rate limit
 * and on the very path some of these journeys exist to test.
 *
 * The API's OWN repository rather than a restated key schema: a second copy of
 * `USER#<id>` / `#PROFILE` would drift from data-model.md silently and the suite
 * would be exercising a shape the product does not use.
 */
const pool = new Pool({ connectionString: e2eEnv.postgresUrl });

const people = new PersonRepository(pool, e2eEnv.tableName);
const credentials = new CredentialRepository(pool, e2eEnv.tableName);

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

/**
 * 011. GIVES AN EXISTING FIXTURE ACCOUNT AN EMAIL AND A PASSWORD.
 *
 * The device flows used to sign in by pasting a token, because that is what the
 * first screen asked for. FR-027 replaced that field with an email address and
 * a password, so a flow pasting a token now selects a control that does not
 * exist — and the whole device pass fails at flow 1.
 *
 * Separate from `createProfile` rather than folded into it: most fixture actors
 * are never signed in AS on the device, they are people the device's account
 * interacts with. Giving all of them credentials would write rows nothing reads,
 * which is the kind of thing that later looks like a requirement.
 */
export async function giveCredentials(
  userId: string,
  handle: string,
): Promise<{ email: string; password: string }> {
  const email = `${handle}@device.local`;
  const password = randomBytes(18).toString('base64url');
  await credentials.put({
    userId,
    emailFolded: CredentialRepository.fold(email),
    password: await derivePassword(password),
    createdAt: new Date().toISOString(),
  });
  return { email, password };
}
