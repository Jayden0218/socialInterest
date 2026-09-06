import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { e2eEnv } from './env';

/**
 * T009. Mints tokens with the SAME issuer and secret the API validates against,
 * so a token this suite creates is one the running API would itself accept.
 *
 * The suite must never construct a token the API would reject and then work
 * around the rejection - that turns an auth defect into a green test.
 */
export interface TestPerson {
  userId: string;
  token: string;
}

export function mintPerson(prefix = 'e2e', opts?: { isOperator?: boolean }): TestPerson {
  const userId = `${prefix}-${randomUUID()}`;
  const token = jwt.sign({ sub: userId, operator: opts?.isOperator === true }, e2eEnv.jwtSecret, {
    issuer: e2eEnv.jwtIssuer,
    expiresIn: '1h',
  });
  return { userId, token };
}

/** A syntactically valid token signed with the WRONG key - for N-01. */
export function mintForgedToken(): string {
  return jwt.sign({ sub: 'forged' }, 'not-the-real-secret', { issuer: e2eEnv.jwtIssuer });
}

/**
 * A token signed with the development secret that used to be this project's
 * default - the literal string, as anyone reading the repository would have it.
 *
 * Deliberately NOT imported from apps/api: the point is that the value was
 * public, so the test states it the way an attacker holds it. If the constant
 * in the API ever changes, this stays the historical value that leaked, which
 * is the one that must keep being refused.
 */
export function mintPublishedSecretToken(): string {
  return jwt.sign({ sub: 'published-secret' }, 'dev-only-not-a-real-secret', {
    issuer: e2eEnv.jwtIssuer,
    expiresIn: '1h',
  });
}
