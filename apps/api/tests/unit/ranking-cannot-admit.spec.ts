import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * G4 — THE GUARD THAT MAKES PRINCIPLE II SURVIVE A RANKED FEED.
 *
 * Constitution 2.0.0, Principle II: *ranking selects candidates; the visibility
 * boundary decides*. This is check C1 of `contracts/ranking-boundary.md`, and it
 * is a DEPENDENCY check rather than a behavioural one: if the ranking module
 * cannot reach the visibility boundary, it cannot have acquired a second
 * visibility predicate, whatever anyone intended.
 *
 * WHY THIS EXISTS AT ALL, and it is worth stating precisely. The composed feed
 * satisfied Principle II BY ACCIDENT: it read only the interests a viewer
 * followed, so its candidate set was already viewer-scoped and could not
 * over-admit. A ranked feed reads across interests the viewer never chose, so
 * that accident is gone. The protection has to become explicit at exactly the
 * moment it stops being structural, which is now.
 *
 * This test is written BEFORE the ranker exists and passes trivially today. That
 * is deliberate and it is the reason it can be written first: a guard asserting
 * an ABSENCE needs nothing to be present. It starts failing the moment somebody
 * writes the import.
 */
const RANKING_DIR = join(__dirname, '../../src/modules/ranking');

/** Names that only appear in code that is deciding who may see what. */
const FORBIDDEN = [
  'VisibilityFilter',
  'visibility.filter',
  'BlockRepository',
  'block.repository',
  'PersonBlockService',
];

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('ranking selects candidates; it does not decide visibility (G4 / C1)', () => {
  it('no file under modules/ranking references the visibility boundary', () => {
    const offenders: string[] = [];
    for (const file of tsFiles(RANKING_DIR)) {
      const src = readFileSync(file, 'utf8');
      for (const name of FORBIDDEN) {
        // A mention inside a comment is the explanation of this rule, not a
        // violation of it - the point is whether the code can CALL it.
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        if (code.includes(name)) {
          offenders.push(`${file.slice(file.indexOf('src/'))} → ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * And the module graph, not just the text. An import through a barrel file
   * would satisfy the check above and still hand the ranker the boundary.
   */
  it('modules/ranking imports nothing from the visibility directory', () => {
    const offenders: string[] = [];
    for (const file of tsFiles(RANKING_DIR)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
        if (m[1]!.includes('visibility')) {
          offenders.push(`${file.slice(file.indexOf('src/'))} → ${m[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
