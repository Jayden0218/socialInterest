import { randomBytes } from 'node:crypto';

/**
 * The JWT secret every harness shares.
 *
 * It has no built-in default any more: the old one was a constant published in
 * this repository, so anyone who read it could mint a token the service would
 * accept (003/FR-007). A generated value is set into the environment once, and
 * both the API child process and the token minting in this suite read it from
 * there - if they disagreed, every request would 401 and the suite would be
 * testing its own misconfiguration.
 */
export function ensureJwtSecret(): string {
  const existing = process.env['LOCAL_JWT_SECRET'];
  if (existing) return existing;
  const generated = randomBytes(32).toString('hex');
  process.env['LOCAL_JWT_SECRET'] = generated;
  return generated;
}
