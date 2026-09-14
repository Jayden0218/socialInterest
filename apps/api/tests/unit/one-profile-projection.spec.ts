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
        /**
         * A VALIDATION SCHEMA IS NOT A PROJECTION EITHER, and it points the
         * opposite way.
         *
         * 011's sign-up schema declares `handle: z.string()` beside
         * `displayName: z.string()` and tripped this guard on its first run —
         * correctly by the rule, wrongly by the purpose, which is the second
         * time that has happened here and the reason the exemption above exists.
         *
         * This guard exists to stop a `PublicProfile` being assembled by hand on
         * the way OUT, because `profile.projection.ts` is the one place that may
         * do it and a second place is how `avatarUrl` shipped as a raw storage
         * key. A zod schema describes what may come IN. It builds nothing,
         * returns nothing, and cannot leak a field, because its whole job is to
         * refuse fields it does not name.
         */
        if (/\bhandle\s*:\s*z\./.test(line)) return;
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

/**
 * 011/T055. FR-016 — THE EMAIL ADDRESS IS ON NO PROFILE PROJECTION.
 *
 * Kept in this file rather than in a new one, because this is the file that
 * knows there is exactly ONE place a `PublicProfile` is built — and that fact is
 * the whole reason the check is cheap. Adding a field to
 * `profile.projection.ts` publishes it on all seven projections at once, which
 * is how 008/US5 found `avatarUrl` emitted as a raw storage key and 006/R4b
 * found it before that.
 *
 * An email address is worse than either. A person's handle is how other people
 * refer to them; their address is how somebody reaches them off the product,
 * and it is the first half of every credential-stuffing attempt against them
 * elsewhere. It belongs to the ACCOUNT, not to the person other people can see.
 */
describe('011/FR-016 the email address is not on a profile', () => {
  it('profile.projection.ts does not read or emit an email', () => {
    const source = readFileSync(
      join(__dirname, '../../src/modules/people/profile.projection.ts'),
      'utf8',
    );
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/\bemail\b/i);
  });

  it('no response type in the shared contract puts an email on a person', () => {
    /**
     * The other direction: the projection could stay clean while the generated
     * types declared the field, and a client would then read something the
     * server never sends — or worse, a later change would populate it to satisfy
     * the type. 008's `response-shape.spec.ts` exists for exactly that asymmetry.
     */
    const entities = readFileSync(
      join(__dirname, '../../../../packages/shared/src/types/entities.ts'),
      'utf8',
    );
    /**
     * `publicProfileSchema`, not `interface PublicProfile` — the type is
     * `z.infer` of the schema, so the schema is where a field would be added.
     * The first version of this line matched the interface spelling, found
     * nothing, and would have passed vacuously over an empty string.
     *
     * The `not.toBe('')` below is what caught that, and it is the assertion this
     * project learned to write after `hooks-before-return.test.ts` went on
     * reporting green while its subject had moved out from under it — "a guard
     * can lose its subject and pass", which is worse than failing.
     */
    const profileBlock =
      /export const publicProfileSchema[\s\S]*?\n\}\);/.exec(entities)?.[0] ?? '';
    expect(profileBlock).not.toBe('');
    expect(profileBlock).not.toMatch(/\bemail\b/i);
  });
});
