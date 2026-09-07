import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '../../src/visibility');

/**
 * COMMENTS STRIPPED, and I made this exact mistake twice in one day.
 *
 * The first version matched the raw file, and it failed on the CLEAN source -
 * because `authored-content.ts` carries a comment reading "THIS FILE MUST NOT
 * IMPORT BlockRepository", and the regex found the prohibition rather than a
 * violation. A guard that reads prose describes the intention, not the build.
 *
 * `scripts/verify-maestro-ids.mjs` learned the same lesson hours earlier, from
 * the opposite direction: a comment naming a value made a selector for a
 * non-existent element resolve, so the check passed against code that could not
 * work. Same root cause, opposite symptom. Documentation is not evidence about
 * the program either way.
 */
const read = (f: string) =>
  readFileSync(join(SRC, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * ONE BLOCK PREDICATE, TWO CALLERS - asserted structurally, not behaviourally.
 *
 * Constitution principle II exists because "six independently written predicates
 * give six chances to leak", and the leak is silent and privacy-affecting. 005
 * adds a second entry point to the visibility module for content with no
 * audience setting (research R4), and the failure mode is not that it gets the
 * block wrong today - it is that it reads blocks INDEPENDENTLY, agrees with the
 * post path for a while, and then quietly stops.
 *
 * A behavioural test cannot catch that. Both implementations would pass every
 * row of the matrix on the day they were written; the divergence arrives with a
 * later change to one of them. So this asserts the shape: there is exactly one
 * place that asks the block question, and the review path is not it.
 *
 * Same reasoning as `feed-does-not-read-place-follows.spec.ts`, which fails when
 * the DEPENDENCY appears rather than waiting for a post to exercise it.
 */
describe('the authored-content entry point shares the post path\'s block check', () => {
  it('does not import BlockRepository', () => {
    const src = read('authored-content.ts');
    expect(src).not.toMatch(/BlockRepository/);
  });

  it('does not read a block by any other route', () => {
    const src = read('authored-content.ts');
    // `isBlockedBetween` lives on RelationshipCache and is the one legitimate
    // way to ask - but asking it HERE would mean this file owns the rule rather
    // than delegating it, which is the thing being prevented.
    expect(src).not.toMatch(/isBlockedBetween/);
    expect(src).not.toMatch(/blocks\./);
  });

  it('delegates to the shared rules instead', () => {
    expect(read('authored-content.ts')).toMatch(/decideAuthoredRules/);
  });

  /**
   * The other half, and the half that would actually rot. If `decide()` stopped
   * delegating and inlined its own copy of the shared rules again, this file
   * would still pass every test above while the two paths silently diverged.
   */
  it('the post path delegates to the same function rather than keeping a copy', () => {
    const src = read('visibility.filter.ts');
    expect(src).toMatch(/const shared = await decideAuthoredRules\(/);

    // The block question is asked exactly once in the whole module.
    const asks = (src.match(/isBlockedBetween/g) ?? []).length;
    expect(asks).toBe(1);
  });

  /**
   * And the shared function must actually be the one holding the rules, not an
   * empty passthrough somebody left behind during a refactor.
   */
  it('the shared function holds all four rules', () => {
    const src = read('visibility.filter.ts');
    const fn = src.slice(src.indexOf('export async function decideAuthoredRules'));
    expect(fn).toMatch(/deletedAt/);
    expect(fn).toMatch(/removedByModeration/);
    expect(fn).toMatch(/authorStatus/);
    expect(fn).toMatch(/isBlockedBetween/);
  });
});
