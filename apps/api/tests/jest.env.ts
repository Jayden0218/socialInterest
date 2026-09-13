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

/**
 * 010. The local datastore, for suites that boot the application.
 *
 * `createPool` refuses to start without this and has no default, for the reason
 * `LOCAL_JWT_SECRET` has none: a default connection string is a password in the
 * repository. This value is not a secret — it is the local container's, written
 * in `docker-compose.yml` where anybody working here can read it — and setting
 * it HERE rather than defaulting it in `pg-pool.ts` keeps the refusal reachable
 * in the one place it matters, which is a deployment that forgot to configure
 * its datastore.
 */
process.env['DATABASE_URL'] ??= 'postgres://sih:localsecret@127.0.0.1:5432/sih';

/**
 * A SMALL POOL PER SUITE, because jest runs suites in parallel processes.
 *
 * Each suite that boots the application opens its own pool, and the default
 * would let a handful of workers exhaust Postgres's connection limit between
 * them. The application closes its pool on shutdown (`PersistenceModule`), so
 * this is about how many are open AT ONCE rather than about leaking.
 */
process.env['DATABASE_POOL_MAX'] ??= '4';
