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
 * THE RULE, STATED PRECISELY, because the first version of this file was vaguer
 * than the code needed and went red on three legitimate reads the moment US13
 * was written — which is the guard doing its job and then being read properly.
 *
 * `accountPrivacy` may be read in exactly three kinds of place:
 *
 *   1. `src/visibility/` — DECIDING whether a viewer may see something. Only
 *      here, and this is the whole point.
 *   2. The one projection and the person item — REPORTING or PERSISTING the
 *      setting. A client has to be able to draw "Request to follow", and a
 *      setting nothing can read is a setting nobody can turn off.
 *   3. `person-follow.service.ts` — ACTING ON IT AT WRITE TIME, to decide
 *      whether a new follow row starts `accepted` or `pending`. That is a
 *      decision about what to WRITE, not about what a viewer may SEE, and it is
 *      the one place in the product that makes it.
 *
 * Anywhere else — a query path, a feed, a surface deciding what to return — is a
 * second visibility predicate, and Principle II's whole rationale is that six
 * independently written predicates give six chances to leak, silently and in a
 * privacy-affecting way.
 *
 * The distinction that matters is READ-SIDE versus everything else. A file that
 * answers "may this viewer see this" from the field, anywhere but the boundary,
 * is the failure; a file that reports the setting or writes a follow row is not.
 *
 * NO READ PATH IS ON THE LIST, and that is the evidence. The plan had every
 * candidate-building site populate an `authorPrivacy` field, which would have
 * put thirteen surfaces here; the boundary reads the author's privacy itself
 * instead, so a surface that forgot is not a thing that can exist. One clause,
 * and every existing surface inherits the rule with no change. If this guard
 * ever fails on a read path, the fix is the boundary, not the surface that
 * tripped it.
 *
 * Written before the code, passes trivially today, and 008/T187 verifies it RED
 * by adding a hand-written check to one surface on purpose.
 */
const API_SRC = join(__dirname, '../../src');

/** Where reading the field is legitimate. */
const ALLOWED_PREFIXES = [
  // (1) Deciding.
  'src/visibility/',
  // (2) Persisting and reporting.
  'src/persistence/person.repository.ts',
  'src/modules/people/profile.projection.ts',
  // PATCH /me sets it. Setting is not deciding.
  'src/modules/people/me.controller.ts',
  // (3) Acting on it at write time: a follow of a private account starts
  // `pending`. No read path consults this.
  'src/modules/people/person-follow.service.ts',
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

  it('the allow-list is a list of places that SET, CARRY or WRITE FROM the field, never one that decides what a viewer may see', () => {
    // A future edit that adds a service here to quiet a failure would defeat the
    // guard silently. Pinning the list makes that a reviewable diff rather than
    // a one-word change nobody reads.
    expect(ALLOWED_PREFIXES).toEqual([
      'src/visibility/',
      'src/persistence/person.repository.ts',
      'src/modules/people/profile.projection.ts',
      'src/modules/people/me.controller.ts',
      'src/modules/people/person-follow.service.ts',
    ]);
  });
});
