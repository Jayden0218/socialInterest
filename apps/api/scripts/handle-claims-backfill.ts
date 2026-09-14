/**
 * 011/T006 + T007. MEASURE FIRST, THEN BACK-FILL.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AT ALL — THE ANALYSIS PASS CAUGHT IT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Handle uniqueness is enforced by a claim row, and accounts that predate this
 * feature hold none. A constraint that consults only rows written from here on
 * defends only handles chosen from here on — so without this, **the first human
 * ever to choose a handle could take one an existing account already holds**.
 * R1's defect, reintroduced by R1's own fix, in exactly the window where the
 * feature is new and being used.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE ORDER IS THE POINT
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   1. MEASURE that no two existing handles already collide.
 *   2. Back-fill a claim per handle, only if (1) holds.
 *   3. If (1) does NOT hold: STOP. Report the collisions and change nothing.
 *
 * Step 3 is not caution for its own sake. A script that picked a winner would be
 * choosing which of two accounts keeps its name — which is R1's silent
 * wrong-person outcome, performed deliberately and at scale. That is a person's
 * decision, and there is no hurry: the existing handles are believed unique
 * because every one carries a machine-generated suffix, so a collision would be
 * genuinely surprising and worth looking at rather than resolving by rule.
 *
 * "Believed" is why step 1 exists. The suffix argument is an ARGUMENT; this is
 * the measurement, and the distinction is the one this project keeps writing
 * down.
 *
 * NO HANDLE IS EVER RENAMED BY THIS. Claiming a handle and changing one are
 * different operations, and research R1's first version conflated them — it
 * forbade "back-filling or renaming", which correctly ruled out the second and
 * incorrectly ruled out the first.
 *
 * Idempotent: a claim that already exists is left alone and counted as such, so
 * re-running costs a pass and changes nothing.
 *
 * Usage:
 *   npx tsx apps/api/scripts/handle-claims-backfill.ts          # measure only
 *   npx tsx apps/api/scripts/handle-claims-backfill.ts --apply  # measure, then write
 */
import { Pool } from 'pg';
import { HandleClaimRepository } from '../src/persistence/handle-claim.repository';

const apply = process.argv.includes('--apply');

if (!process.env['DATABASE_URL']) {
  process.stderr.write('DATABASE_URL is not set. Use the value the API was started with.\n');
  process.exit(2);
}

interface HandleRow {
  handleLower: string;
  userId: string;
  holders: number;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] ?? '' });
  const claims = new HandleClaimRepository(pool, process.env['TABLE_NAME'] ?? 'items');

  /**
   * Read from the HANDLE index rather than by scanning for `type = 'Person'`.
   *
   * `gsi1pk = 'HANDLE#<lower>'` is precisely what `findByHandle` resolves, so
   * this counts collisions as the lookup would experience them. Counting
   * distinct `item->>'handle'` instead would miss two people whose handles
   * differ only in case — which collide for the lookup and would not collide in
   * that count.
   */
  const { rows } = await pool.query<HandleRow>(`
    select
      replace(gsi1pk, 'HANDLE#', '') as "handleLower",
      min(item->>'userId')           as "userId",
      count(*)::int                  as holders
    from items
    where gsi1sk = '#PROFILE' and gsi1pk like 'HANDLE#%'
    group by gsi1pk
  `);

  const collisions = rows.filter((r) => r.holders > 1);

  process.stdout.write(`handles: ${rows.length}\n`);
  process.stdout.write(`collisions: ${collisions.length}\n`);

  if (collisions.length > 0) {
    process.stdout.write('\nSTOPPING. These handles are held by more than one person:\n');
    for (const c of collisions.slice(0, 50)) {
      process.stdout.write(`  ${c.handleLower}  (${c.holders} holders)\n`);
    }
    process.stdout.write(
      '\nNothing has been written. Which account keeps a contested handle is a\n' +
        "person's decision, not this script's — see the header.\n",
    );
    await pool.end();
    process.exit(1);
  }

  if (!apply) {
    process.stdout.write('\nMeasurement only. Re-run with --apply to write the claims.\n');
    await pool.end();
    return;
  }

  let claimed = 0;
  let already = 0;
  for (const row of rows) {
    const ok = await claims.claimAlone(row.handleLower, row.userId);
    if (ok) claimed++;
    else already++;
  }

  process.stdout.write(`\nclaimed: ${claimed}\nalready claimed: ${already}\n`);
  await pool.end();
}

main().catch((err: unknown) => {
  process.stderr.write(`handle claim back-fill failed: ${String(err)}\n`);
  process.exit(1);
});
