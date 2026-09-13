/**
 * 010/T003. Creates the Postgres schema the datastore is moving to.
 *
 * A NEW SCRIPT RATHER THAN A REWRITE of `create-local-table.ts`, which is a
 * deliberate correction to T003 as written. Rewriting it would leave no way to
 * create the DynamoDB table — and T007, the step this migration's provability
 * rests on, requires the contract test to run against the engine being replaced
 * and be watched GREEN there first. That engine has to be startable and its
 * table creatable for as long as both sides are being compared.
 *
 * `create-local-table.ts` is removed in Phase 6, with the service it creates
 * against, once the contract has been proven on both sides.
 *
 * data-model.md § The one table. `keys.ts` is untouched: `pk`, `sk` and the five
 * index key pairs carry exactly the values they carry today, and `item` holds
 * the whole item including its key attributes, so a read returns what every one
 * of the twenty-nine repositories already expects.
 *
 * Usage:  pnpm --filter @sih/infra db:create-local-pg [--recreate]
 */
import { Client } from 'pg';
import { env } from './env';

/**
 * PARTIAL INDEXES, BECAUSE A GLOBAL SECONDARY INDEX IS SPARSE.
 *
 * In DynamoDB an item that carries no `gsi2pk` simply does not appear in gsi2.
 * A plain btree index does not work that way: it would hold a row for every item
 * in the table, five times over, most of them NULL — five times the write cost
 * for nothing, and a query that has to filter them back out.
 *
 * `where gsiNpk is not null` reproduces the old behaviour exactly, and the
 * contract calls getting this wrong out by name: "a sparse index must stay
 * sparse ... a query that returns MORE than it should is precisely the input
 * the visibility boundary is protecting against". The matrix would still pass,
 * because it asserts the boundary's decisions and not the candidate set handed
 * to it.
 */
const SCHEMA = `
create table if not exists items (
  pk      text  not null,
  sk      text  not null,
  gsi1pk  text, gsi1sk  text,
  gsi2pk  text, gsi2sk  text,
  gsi3pk  text, gsi3sk  text,
  gsi4pk  text, gsi4sk  text,
  gsi5pk  text, gsi5sk  text,
  item    jsonb not null,
  primary key (pk, sk)
);
` +
  [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `create index if not exists items_gsi${n} on items (gsi${n}pk, gsi${n}sk) where gsi${n}pk is not null;`,
    )
    .join('\n');

async function main(): Promise<void> {
  const client = new Client({ connectionString: env.postgresUrl });
  await client.connect();
  try {
    if (process.argv.includes('--recreate')) {
      // Named explicitly rather than `drop schema public cascade`, which would
      // also take anything a future feature puts beside it.
      await client.query('drop table if exists items');
      console.log('dropped items');
    }
    await client.query(SCHEMA);

    // Reported rather than assumed. A `create ... if not exists` that silently
    // did nothing looks identical to one that worked, and this project has paid
    // for that shape often enough - a probe that answers without having done
    // anything is how a wedged DynamoDB Local passed its own health check.
    const { rows } = await client.query<{ indexname: string }>(
      `select indexname from pg_indexes where tablename = 'items' order by indexname`,
    );
    console.log(`items exists with ${rows.length} indexes: ${rows.map((r) => r.indexname).join(', ')}`);
  } finally {
    await client.end();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
