import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { strippedCode, tsFiles } from './support/forbidden-imports';

/**
 * 008/T071, US5 — A `PublicProfile` IS BUILT IN ONE PLACE.
 *
 * `avatarUrl` was emitted on ONE of seven hand-written profile projections, and
 * there it was the raw storage KEY. `avatarKey` had no writer at all. SC-008
 * asks for the avatar on 100% of surfaces showing that person, and seven
 * hand-written projections is seven chances to omit a field.
 *
 * Same argument as one `VisibilityFilter` and one
 * `PostQueryService.responseFor`, and this codebase has shipped the
 * response-shape version of that defect SEVEN times — the feed, post detail,
 * both comment paths, notifications, a person's own profile, and the interest
 * space, which is the product's primary browse surface.
 *
 * WHAT THIS DETECTS: `handle:` and `displayName:` appearing within a few lines
 * of each other, which is what building a profile by hand looks like whether it
 * is written on one line or spread over four.
 *
 * The FIRST version matched a single line only, and on its first run it caught
 * seven of the nine sites and silently passed over `post-query.service.ts`,
 * `comment.service.ts` and `person.controller.ts` — the multi-line ones,
 * including the file that emitted the raw storage key this whole story exists
 * to fix. A guard that finds most of a defect is how the rest of it survives.
 *
 * It still cannot detect one assembled field-by-field into a variable, and that
 * limit is stated rather than implied: this raises the cost of the obvious
 * mistake, it does not make the mistake impossible.
 */
const API_SRC = join(__dirname, '../../src');

/** Where constructing one is the job. */
const ALLOWED = [
  'src/modules/people/profile.projection.ts',
  // The persistence shape, which is what a projection is built FROM.
  'src/persistence/person.repository.ts',
  // The test harness mints people; it is not a response path.
  'src/modules/identity/',
];

describe('008/SC-008 one profile projection', () => {
  it('no module outside profile.projection.ts builds a PublicProfile by hand', () => {
    const offenders: string[] = [];
    for (const file of tsFiles(API_SRC)) {
      const rel = file.slice(file.indexOf('src/'));
      if (ALLOWED.some((a) => rel.startsWith(a))) continue;
      const lines = strippedCode(readFileSync(file, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        if (!/\bhandle\s*:/.test(line)) return;
        /**
         * A TYPE ANNOTATION is not a projection.
         *
         * `author: { userId: string; handle: string; displayName: string }` is a
         * shape being DECLARED, not built, and the first run of this guard
         * flagged one - correctly by its own rule and wrongly by its purpose.
         * The right fix there was to use `ProfileSource` rather than restate the
         * shape, so the false positive found a real duplication; this line stops
         * the next one from being noise.
         */
        if (/\bhandle\s*:\s*string\b/.test(line)) return;
        // A WINDOW, not a line. Four lines covers every hand-built literal in
        // this codebase, one-line and multi-line alike, without reaching across
        // unrelated object boundaries.
        const window = lines.slice(Math.max(0, i - 4), i + 5).join('\n');
        if (/\bdisplayName\s*:/.test(window)) offenders.push(`${rel}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the allow-list names places that DEFINE or STORE a profile, never one that returns it', () => {
    // Adding a service here to quiet a failure would defeat the guard silently.
    // Pinning it makes that a reviewable diff rather than a one-line change.
    expect(ALLOWED).toEqual([
      'src/modules/people/profile.projection.ts',
      'src/persistence/person.repository.ts',
      'src/modules/identity/',
    ]);
  });
});
