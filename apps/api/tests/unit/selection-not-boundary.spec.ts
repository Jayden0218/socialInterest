import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 008/T010 — G4. MUTE AND DISMISSAL ARE SELECTION, NEVER THE BOUNDARY.
 *
 * This is the load-bearing guard of feature 008 and it enforces
 * `specs/008-post-reach-and-depth/contracts/selection-vs-boundary.md`.
 *
 * THE TEST THAT DECIDES WHICH SIDE A RULE FALLS ON, and the only one permitted:
 *
 *   Does the rule change the answer to *may this viewer see this post* — on
 *   EVERY surface, including the author's own profile?
 *
 * For **mute** the answer is no. The follow survives, the conversation survives,
 * and the muted person's profile stays readable — their posts are still there if
 * you go and look. Mute means *do not select*, which Principle II's second clause
 * assigns to the ranker. Putting it in `VisibilityFilter` would make a muted
 * person's profile EMPTY, which is not what mute means and which no requirement
 * asks for, and would give the one boundary a second meaning that every future
 * surface would inherit without asking for it.
 *
 * For **dismissal** the answer is also no, and doubly so: it is additionally a
 * ranking signal (008/FR-042), which only a selection stage can consume.
 *
 * For **account privacy** the answer is YES, which is why it is absent from the
 * forbidden list below and lives in the filter as one clause (008/FR-043–045).
 * The contrast is the point: two rules that look alike, on opposite sides, and
 * one question that separates them.
 *
 * A DEPENDENCY CHECK, not a behavioural one. If the visibility module cannot
 * reach the mute or dismissal repositories, it cannot have acquired their rules,
 * whatever anyone intended. It fails when the import appears — before any post
 * exists that would demonstrate the leak. The behavioural half is
 * `tests/integration/mute-does-not-hide-profile.spec.ts`, and neither is
 * sufficient alone: a structural guard says the dependency is absent, never that
 * the behaviour is right.
 *
 * Written BEFORE the code it governs, per the constitution's rule that a test
 * defining a contract exists before the implementations it governs. It passes
 * trivially today — a guard asserting an ABSENCE needs nothing to be present —
 * and 008/T171 verifies it RED by wiring mute into the filter on purpose.
 */
const VISIBILITY_DIR = join(__dirname, '../../src/visibility');

/**
 * Names that only appear in code applying a per-viewer SELECTION rule.
 *
 * `Mute`/`Dismissal` as bare words would match prose; these are the identifiers
 * a caller would actually have to write.
 */
const FORBIDDEN = [
  'MuteRepository',
  'mute.repository',
  'MuteService',
  'DismissalRepository',
  'dismissal.repository',
  'DismissalService',
  'CandidateSource',
  'RankingService',
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

/**
 * Comments are stripped LINE BY LINE, keeping the line count, so a reported line
 * number still points at the offending line.
 *
 * Both halves of this matter and this project has been bitten by each. 004 found
 * a guard that a COMMENT made pass over a real violation — "a guard that reads
 * prose describes the intention, not the build". 007 found the mirror: a doc
 * comment containing an example made `text-has-colour` accuse the one file whose
 * job was to prevent the thing.
 */
function strippedCode(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

describe('008/G4 the visibility boundary cannot reach a selection rule', () => {
  it('no file under src/visibility references mute, dismissal or the ranker', () => {
    const offenders: string[] = [];
    for (const file of tsFiles(VISIBILITY_DIR)) {
      const code = strippedCode(readFileSync(file, 'utf8'));
      code.split('\n').forEach((line, i) => {
        for (const name of FORBIDDEN) {
          if (line.includes(name)) {
            offenders.push(`${file.slice(file.indexOf('src/'))}:${i + 1} → ${name}`);
          }
        }
      });
    }
    // On failure, name the file, the line and the identifier. "expected [] to
    // equal [...]" would send the next person hunting.
    expect(offenders).toEqual([]);
  });

  it('account privacy is DELIBERATELY not forbidden — it belongs in the boundary', () => {
    // The contrast is the guard's meaning. If someone later adds accountPrivacy
    // to FORBIDDEN, the rule has been misread as "nothing per-viewer in the
    // filter", which is the opposite of Principle II.
    expect(FORBIDDEN.some((n) => n.toLowerCase().includes('privacy'))).toBe(false);
  });
});
