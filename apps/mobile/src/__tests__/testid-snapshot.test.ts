import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 006/T006, SC-005. TESTIDS ARE AN INTERFACE, AND THIS IS THE HALF NOTHING ELSE
 * CHECKED.
 *
 * `scripts/verify-maestro-ids.mjs` proves every SELECTOR in `.maestro/` resolves
 * to something in the app. It cannot prove every testID SURVIVED, because a
 * testID deleted together with the flow that used it satisfies it perfectly.
 * The two checks face opposite directions:
 *
 *     verify-maestro-ids   flows -> app       "does every selector exist?"
 *     this file            app   -> snapshot  "did anything disappear?"
 *
 * 19 Maestro flows and every browser journey select on these. A redesign touches
 * nearly every component, and "we were careful" is not a control. Renaming one
 * is a breaking change that currently fails twenty minutes into a 25-minute
 * emulator run.
 *
 * Same shape as `apps/api/tests/integration/auth-surface.spec.ts`, which
 * compares the public route set to a snapshot in BOTH directions - written that
 * way because its first version was a hand-picked list and missed the second
 * occurrence of the defect it existed to catch.
 *
 * To accept a deliberate change, run with `UPDATE_TESTID_SNAPSHOT=1` and commit
 * the snapshot in the SAME commit as the flow updates it requires.
 */
const SRC = join(__dirname, '..');
const SNAPSHOT = join(__dirname, 'testid-snapshot.json');

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

interface Extracted {
  literals: string[];
  prefixes: string[];
}

/**
 * Comments stripped, for the reason this repository has now learned three times:
 * a guard that reads prose describes the intention, not the build. A testID
 * named only in a comment is not a testID.
 */
const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

export function extractTestIds(files: string[]): Extracted {
  const literals = new Set<string>();
  const prefixes = new Set<string>();

  for (const file of files) {
    const src = strip(readFileSync(file, 'utf8'));

    // `testID="foo"` and `testID={`foo-${x}`}` in one pass: the capture is
    // everything before a quote or a `${`, and the trailing group says which.
    for (const m of src.matchAll(/testID=\{?["'`]([^"'`$]*)(\$\{)?/g)) {
      if (m[2]) prefixes.add(m[1]!);
      else if (m[1]) literals.add(m[1]!);
    }

    // `testID: 'foo'` - the object form, used where props are spread.
    for (const m of src.matchAll(/testID:\s*["'`]([^"'`$]+)["'`]/g)) literals.add(m[1]!);
  }

  return {
    literals: [...literals].sort(),
    prefixes: [...prefixes].sort(),
  };
}

describe('every testID survives (006/SC-005)', () => {
  it('matches the committed snapshot, allowing additions but never removals', () => {
    const found = extractTestIds(tsxFiles(SRC));

    if (process.env['UPDATE_TESTID_SNAPSHOT'] === '1' || !existsSync(SNAPSHOT)) {
      writeFileSync(SNAPSHOT, `${JSON.stringify(found, null, 2)}\n`);
      return;
    }

    const committed = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Extracted;

    /**
     * ADDITIONS PASS, REMOVALS FAIL - deliberately asymmetric.
     *
     * A redesign adds ids constantly and blocking on that would make the guard a
     * nuisance somebody switches off. Nothing in `.maestro/` can break because a
     * new id appeared; everything can break because one left.
     */
    const missingLiterals = committed.literals.filter((id) => !found.literals.includes(id));
    const missingPrefixes = committed.prefixes.filter((p) => !found.prefixes.includes(p));

    expect({ literals: missingLiterals, prefixes: missingPrefixes }).toEqual({
      literals: [],
      prefixes: [],
    });
  });

  /**
   * The snapshot is only worth having if it is not empty, and a bug in the
   * extractor that returned nothing would make every future run pass.
   */
  it('extracts a plausible number of ids, so a broken extractor cannot pass silently', () => {
    const found = extractTestIds(tsxFiles(SRC));
    expect(found.literals.length).toBeGreaterThan(100);
    expect(found.prefixes.length).toBeGreaterThan(20);
  });
});
