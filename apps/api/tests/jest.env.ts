import { randomBytes } from 'node:crypto';

/**
 * The API refuses to boot without LOCAL_JWT_SECRET, and refuses the published
 * development value outright (003/FR-007) - the old default was a constant in
 * this repository, so anyone who read it could mint a token the service would
 * accept.
 *
 * Tests therefore generate one. A fixed literal here would recreate the same
 * problem in a different file.
 */
process.env['LOCAL_JWT_SECRET'] ??= randomBytes(32).toString('hex');
