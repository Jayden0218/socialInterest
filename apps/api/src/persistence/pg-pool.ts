import { Pool } from 'pg';
import type { AppConfig } from '../config/configuration';

/**
 * 010/T008. The connection pool, and the credential it needs comes from the
 * ENVIRONMENT and never from a file (FR-016).
 *
 * There is no default connection string with a password in it, deliberately.
 * `LOCAL_JWT_SECRET` used to have a default and it was a constant published in
 * this repository — anybody who read the repository could mint a token the
 * service would accept. A datastore password is the same mistake with more
 * behind it, so `DATABASE_URL` is required and its absence is a refusal rather
 * than a fallback.
 *
 * The local stack's value lives in `docker-compose.yml` and in the developer's
 * environment, which is where a value anybody may know belongs.
 */
export function createPool(config: AppConfig): Pool {
  const connectionString = config.datastore.url;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. It has no default: a default connection string means a ' +
        'password in the repository, which is 003/FR-007 in a second place.',
    );
  }

  return new Pool({
    connectionString,
    /**
     * SMALL ON PURPOSE. The free managed tier this is going to caps connections
     * well below what a pool would happily open, and a pool that exhausts the
     * server's limit fails as "too many clients" on an unrelated request —
     * which reads as a defect somewhere else entirely.
     *
     * Registered as a divergence rather than assumed: what this number should
     * be on the managed side is not knowable from here.
     */
    max: Number(process.env['DATABASE_POOL_MAX'] ?? 8),
    /**
     * Managed Postgres requires TLS; the local container does not offer it.
     * `rejectUnauthorized: false` is what a managed provider's pooler wants
     * where its certificate chain is not in the system store — it still
     * encrypts, and it is set only when TLS is asked for.
     */
    ...(process.env['DATABASE_SSL'] === 'true'
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  });
}

export const PG_POOL = Symbol('PgPool');
