/**
 * 011/T010. THE PASSWORD PRIMITIVE.
 *
 * Three properties, and each one is the difference between a password store and
 * a liability:
 *
 *   1. A SALT IS PRESENT — the same password derives to a different value twice,
 *      so identical passwords are not identifiable as identical, and one
 *      precomputed table does not open every account at once.
 *   2. Verification accepts the right password and refuses the wrong one, which
 *      is the only part anybody would think to test.
 *   3. THE COMPARISON IS CONSTANT-TIME. A `===` on two hashes returns as soon as
 *      it finds a differing byte, which leaks how much of the hash a guess got
 *      right. `timingSafeEqual` does not.
 *
 * (3) is structural here rather than statistical: timing a comparison of 32
 * bytes across a jest process is measuring the scheduler. What CAN be asserted
 * is that the code path is `timingSafeEqual` and that it copes with the input a
 * short-circuiting comparison would have exited early on — including hashes of
 * DIFFERENT LENGTHS, where `timingSafeEqual` throws rather than returning false,
 * and an implementation that forgets to handle that turns a malformed stored
 * hash into a 500 instead of a refusal.
 */
import { derivePassword, verifyPassword, parseStored } from '../../src/modules/auth/password';
import { PASSWORD_MIN_LENGTH } from '../../src/modules/auth/constants';

describe('password derivation', () => {
  it('derives a different stored value for the same password twice', async () => {
    const a = await derivePassword('correct horse battery staple');
    const b = await derivePassword('correct horse battery staple');
    expect(a).not.toEqual(b);
  });

  it('stores the parameters alongside the hash, so the choice stays reversible', async () => {
    /**
     * A record that says HOW it was derived can be re-derived differently later.
     * One that does not is a decision that had to be correct on the first day —
     * and `scrypt`'s cost parameters are exactly the kind of thing that should
     * rise over a decade.
     */
    const stored = await derivePassword('correct horse battery staple');
    const parsed = parseStored(stored);
    expect(parsed.algorithm).toBe('scrypt');
    expect(parsed.params.N).toBeGreaterThanOrEqual(16384);
    expect(parsed.salt.length).toBeGreaterThanOrEqual(16);
  });

  it('accepts the right password and refuses the wrong one', async () => {
    const stored = await derivePassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
    expect(await verifyPassword('correct horse battery stapl', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('refuses rather than throwing when the stored value is malformed', async () => {
    /**
     * A stored value this cannot parse is a refusal, never an exception.
     *
     * The dummy hash sign-in derives against for an unknown address (R3) goes
     * through exactly this path, so a throw here would be a 500 on the one code
     * path whose entire purpose is to be indistinguishable from the ordinary
     * one — leaking, by error, precisely the fact the timing work exists to
     * hide.
     */
    expect(await verifyPassword('anything', 'not-a-stored-hash')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$1$2$3$4')).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
  });

  it('uses a constant-time comparison, structurally', async () => {
    /**
     * ASSERTED BY READING THE SOURCE, and the reason is worth stating rather
     * than leaving as an oddity: timing 32 bytes inside a jest process measures
     * the scheduler, not the comparison. A test that "proved" constant time
     * that way would be noise dressed as evidence — which is the shape of the
     * invented 250-pixel keyboard constant this project already paid four
     * device runs for.
     *
     * So: the dependency is asserted, and the behaviour it buys is asserted
     * above. The pair is honest about which is which.
     */
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../../src/modules/auth/password.ts'),
      'utf8',
    ) as string;
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    /**
     * THE FIRST VERSION OF THIS ASSERTION PASSED AGAINST A DELIBERATE BREAK.
     *
     * It checked that the FILE contained `timingSafeEqual` and that no `===`
     * appeared in a few hand-guessed spellings. Replacing the comparison with
     * `derived.toString('base64') === parsed.hash.toString('base64')` left the
     * import at the top of the file untouched — so "the file contains
     * timingSafeEqual" stayed true, none of the guessed spellings matched, and
     * six assertions reported green over a short-circuiting comparison.
     *
     * A hand-picked list of ways to be wrong only covers the ways somebody has
     * already been wrong, which is 004's lesson about the first version of
     * `auth-surface.spec.ts`. So this looks at the FUNCTION rather than the file,
     * and asks two questions with no list in them: does the comparison it
     * RETURNS come from `timingSafeEqual`, and is there any `===` left in the
     * body at all?
     */
    const body = /export async function verifyPassword[\s\S]*?\n}/.exec(code)?.[0];
    expect(body).toBeDefined();
    expect(body).toMatch(/return\s+timingSafeEqual\(/);
    expect(body).not.toContain('===');
  });

  it('agrees with the floor the app shows', () => {
    // Not a password test — a two-sources-of-truth test. The screen states the
    // floor before submission (FR-005) and the server refuses below it, and
    // those are two statements of one fact.
    expect(PASSWORD_MIN_LENGTH).toBe(10);
  });
});
