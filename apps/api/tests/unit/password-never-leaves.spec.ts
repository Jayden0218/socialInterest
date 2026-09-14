/**
 * 011/T054. SC-008, FR-015, FR-016 — A PASSWORD REACHES NO OUTPUT.
 *
 * Not stored recoverably, not logged, not in an error, not in a response body,
 * not in any diagnostic. **Searched for, not assumed**, which is what SC-008
 * says and is the difference between a control and a hope: "we were careful" is
 * not a mechanism, and every leak in this repository's history was written by
 * somebody being careful.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TWO DIRECTIONS, BECAUSE ONE OF THEM CANNOT SEE THE OTHER
 * ────────────────────────────────────────────────────────────────────────────
 *
 * STRUCTURAL: no code puts a password-shaped value where output goes. This
 * catches the leak that has not happened yet — a `logger.debug({ body })` added
 * while debugging and left in, which is how most of them arrive.
 *
 * BEHAVIOURAL: `auth-signup-concurrency.spec.ts` and `auth-signup-person.spec.ts`
 * assert the real responses carry neither the password nor its derived form.
 * A structural scan cannot see a field that reaches a response through a spread,
 * and a response assertion cannot see a log line. Neither is sufficient.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * VERIFIED AGAINST A PLANTED LEAK
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Recorded in `docs/verification/011-guard-red-log.md`. A guard that has only
 * ever passed is not a guard — and this project has one that passed a
 * deliberate break in THIS FEATURE (the constant-time check, whose first
 * version asserted the file contained `timingSafeEqual` while the import alone
 * kept that true). So this one was watched failing before it was trusted.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '../../src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Comments blanked LINE BY LINE, so a line number in a failure still points at
 * the real line. 007's `text-has-colour` accused the one file whose job was to
 * prevent the thing it was accusing it of, because a doc comment contained an
 * example — the mirror of the usual failure, and the reason this is not
 * optional.
 */
const strip = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Anything that carries a value out of the process where a person could read it. */
const SINKS = /\b(console\.(log|info|warn|error|debug|trace)|logger\.(log|info|warn|error|debug|verbose)|process\.std(out|err)\.write)\s*\(/;

/**
 * A password-shaped expression. `password` alone would match the FIELD NAME in
 * a type declaration and in `keys.ts`, which carry no value.
 *
 * `derivePassword` and `verifyPassword` are calls, not values, and appear in
 * `password.ts` where they belong; they are excluded by name rather than by
 * hoping the sink pattern never meets them.
 */
const PASSWORD_VALUE = /\b(?<!derive)(?<!verify)(password|plaintext|credential\.password|input\.password)\b/i;

describe('a password reaches no output', () => {
  it('no source file writes a password-shaped value to a log or a stream', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = file.slice(file.indexOf('src/'));
      const lines = strip(readFileSync(file, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        if (!SINKS.test(line)) return;
        if (!PASSWORD_VALUE.test(line)) return;
        offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
      });
    }
    // Located, not counted: a bare number sends somebody reading forty files.
    expect(offenders).toEqual([]);
  });

  it('nothing outside the auth module and the datastore seam names a stored password', () => {
    /**
     * THE DERIVED FORM IS A SECRET TOO (FR-016). It is not the password, and it
     * is the thing an offline guessing attack runs against — so a response, a
     * projection or a log carrying it is a leak with a longer fuse.
     *
     * Only three places may name it: the module that derives and verifies, the
     * repository that stores it, and the two scripts that provision a device
     * account. Anywhere else is a second handler of a secret, which is D6's
     * argument about `VisibilityFilter` applied to a value rather than a
     * decision.
     */
    const ALLOWED = new Set([
      'src/modules/auth/password.ts',
      'src/modules/auth/auth.service.ts',
      'src/persistence/credential.repository.ts',
    ]);
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = file.slice(file.indexOf('src/'));
      if (ALLOWED.has(rel)) continue;
      const code = strip(readFileSync(file, 'utf8'));
      // The controller names the FIELD in its validation schema, which is input
      // and not a stored value — it is how the password arrives, and refusing
      // to name it there would mean not validating it.
      if (rel === 'src/modules/auth/auth.controller.ts') continue;
      if (/\.password\b/.test(code)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('the problem filter cannot echo a request body', () => {
    /**
     * The one sink every refusal goes through.
     *
     * `ProblemFilter` builds the body of every error response in the product, so
     * a `detail` built from the request would put a mistyped password into the
     * response to the request that contained it — and into whatever logs that
     * response. Checked here rather than trusted because it is one file and the
     * blast radius is every endpoint.
     */
    const code = strip(readFileSync(join(SRC, 'common/errors/problem.filter.ts'), 'utf8'));
    expect(code).not.toMatch(/req(uest)?\.body/);
  });
});
