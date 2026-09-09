import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 008/T011 — G5. ACCOUNT PRIVACY IS ONE CLAUSE IN ONE BOUNDARY.
 *
 * The companion to `selection-not-boundary.spec.ts`, guarding the other side of
 * `contracts/selection-vs-boundary.md`.
 *
 * Making an account private DOES change whether a viewer may see a post, on
 * every surface simultaneously, and 001/FR-017 + SC-009 require that flip to
 * land everywhere immediately. That is the boundary's job and nothing else's.
 *
 * So `accountPrivacy` may be READ in exactly two kinds of place: inside
 * `src/visibility/`, where the decision is made, and at the points that BUILD a
 * candidate or persist the field. Anywhere else — a service, a controller, a
 * query path deciding what to return — is a second visibility predicate, and
 * Principle II's whole rationale is that six independently written predicates
 * give six chances to leak, silently and in a privacy-affecting way.
 *
 * The elegance is the evidence: one candidate field and one clause means every
 * existing surface inherits the rule with no change. If this guard ever fails,
 * the fix is the boundary, not the surface that tripped it.
 *
 * Written before the code, passes trivially today, and 008/T187 verifies it RED
 * by adding a hand-written check to one surface on purpose.
 */
const API_SRC = join(__dirname, '../../src');

/** Where reading the field is legitimate. */
const ALLOWED_PREFIXES = [
  'src/visibility/',
  // The candidate is CONSTRUCTED here and handed to the boundary; it does not
  // decide anything with it.
  'src/modules/posts/post-query.service.ts',
  // The person item declares and persists the field.
  'src/persistence/person.repository.ts',
  // PATCH /me sets it. Setting is not deciding.
  'src/modules/people/me.controller.ts',
];

const FIELD = 'accountPrivacy';

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Comments blanked line-by-line so a reported line number still points at the line. */
function strippedCode(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

describe('008/G5 account privacy is decided in one place', () => {
  it('no module outside the boundary reads accountPrivacy to decide what to return', () => {
    const offenders: string[] = [];
    for (const file of tsFiles(API_SRC)) {
      const rel = file.slice(file.indexOf('src/'));
      if (ALLOWED_PREFIXES.some((p) => rel.startsWith(p))) continue;
      const code = strippedCode(readFileSync(file, 'utf8'));
      code.split('\n').forEach((line, i) => {
        if (line.includes(FIELD)) offenders.push(`${rel}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the allow-list is a list of places that SET or CARRY the field, never one that decides', () => {
    // A future edit that adds a service here to quiet a failure would defeat the
    // guard silently. Pinning the list makes that a reviewable diff rather than
    // a one-word change nobody reads.
    expect(ALLOWED_PREFIXES).toEqual([
      'src/visibility/',
      'src/modules/posts/post-query.service.ts',
      'src/persistence/person.repository.ts',
      'src/modules/people/me.controller.ts',
    ]);
  });
});
