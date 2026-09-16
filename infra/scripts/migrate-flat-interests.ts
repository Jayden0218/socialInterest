/**
 * 013/T024, FR-020. FLATTEN AN INSTALLATION THAT PREDATES USER-OWNED INTERESTS.
 *
 * Existing interests were written with a hierarchy key — gsi3 `PARENT#<id>` —
 * and carry `level` and `parentId`. The flat catalogue reads a single
 * `ICATALOGUE` partition, so until a row is rewritten it is invisible: the
 * cache loads empty and the duplicate gate accepts everything.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IT COUNTS COLLISIONS FIRST AND REFUSES TO WRITE IF THERE ARE ANY
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Two sub-interests under different parents could legitimately share a name —
 * "portraits" under Photography and under Painting. Flat, they collide, and the
 * name claim can only be held by one.
 *
 * WHICH ONE KEEPS THE NAME IS A PERSON'S DECISION, NOT A SCRIPT'S. 011 settled
 * this for handles: the back-fill "refus[es] to write at all if that count is
 * not zero", having measured 0 collisions across 6,375 existing handles first —
 * which is what made the generated-suffix argument unnecessary rather than
 * merely unattractive.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CHILDREN ARE NEVER FOLDED INTO PARENTS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Every interest survives under its OWN name; only the parent edge is dropped.
 * Folding a child into its parent would move somebody's post to a subject they
 * did not choose, which is precisely the imposition this feature exists to end.
 */
import { Pool } from 'pg';
import { env, loadEnv } from './env';

const normaliseName = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function main(): Promise<void> {
  loadEnv();
  const pool = new Pool({ connectionString: env.postgresUrl });
  try {
    const { rows } = await pool.query<{ pk: string; item: Record<string, unknown> }>(
      "select pk, item from items where item->>'type' = 'Interest'",
    );
    console.log(`found ${rows.length} interests`);
    if (rows.length === 0) return;

    // ── measure before writing ──────────────────────────────────────────────
    const byName = new Map<string, string[]>();
    for (const r of rows) {
      const n = normaliseName(String(r.item['name'] ?? ''));
      byName.set(n, [...(byName.get(n) ?? []), String(r.item['name'])]);
    }
    const collisions = [...byName.entries()].filter(([, v]) => v.length > 1);
    console.log(`name collisions once flattened: ${collisions.length}`);
    if (collisions.length > 0) {
      for (const [n, names] of collisions) console.error(`  "${n}": ${names.join(', ')}`);
      throw new Error(
        `${collisions.length} name collision(s). REFUSING TO WRITE.\n` +
          'Which interest keeps a contested name is a decision for a person, not this script.\n' +
          'Merge or rename them first, then re-run.',
      );
    }

    // ── rewrite ─────────────────────────────────────────────────────────────
    let migrated = 0;
    let claimed = 0;
    for (const r of rows) {
      const item = { ...r.item };
      delete item['level'];
      delete item['parentId'];
      const nameNormalised = normaliseName(String(item['name'] ?? ''));
      item['nameNormalised'] = nameNormalised;

      await pool.query(
        // gsi3 moves from PARENT#<id> to the one flat catalogue partition.
        "update items set item = $2, gsi3pk = 'ICATALOGUE', gsi3sk = $3 where pk = $1 and sk = '#META'",
        [r.pk, JSON.stringify(item), nameNormalised],
      );
      migrated += 1;

      // The claim row these rows predate. Idempotent: re-running is a no-op.
      const claim = await pool.query(
        `insert into items (pk, sk, item) values ($1, '#CLAIM', $2)
         on conflict (pk, sk) do nothing`,
        [
          `INAME#${nameNormalised}`,
          JSON.stringify({
            type: 'InterestNameClaim',
            interestId: item['interestId'],
            nameNormalised,
            claimedAt: new Date().toISOString(),
          }),
        ],
      );
      claimed += claim.rowCount ?? 0;
    }
    console.log(`migrated ${migrated} interests, wrote ${claimed} name claims`);
  } finally {
    await pool.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
