import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 010/T034, FR-016. NOTHING CREDENTIAL-SHAPED IS COMMITTED, AND THIS FAILS THE
 * BUILD RATHER THAN ASKING SOMEBODY TO BE CAREFUL.
 *
 * This project has shipped a credential in a file once: `LOCAL_JWT_SECRET` had
 * a default that was a constant in this repository, so anybody who read it
 * could mint a token the service accepted. 003 removed the default. What was
 * never added is the thing that stops the next one — and "we are careful about
 * this" is the control that failed the first time.
 *
 * 010 makes it urgent rather than tidy: the datastore and the object store are
 * managed services now, reached with keys, and the difference between a key in
 * an environment and a key in a commit is the difference between a rotation and
 * an incident.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT IT SCANS, AND WHY THAT IS THE GIT INDEX AND NOT THE DIRECTORY
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `git ls-files` — so it reads exactly what a commit would carry. Walking the
 * filesystem would read `.env.local`, which is gitignored and is SUPPOSED to
 * hold real values, and a guard that fails on the one file designed to hold
 * secrets is a guard somebody switches off in its first week.
 *
 * It also means an ignored file that later stops being ignored is caught by
 * this the moment it is staged, which is the moment that matters.
 */
const REPO = resolve(__dirname, '../../../..');

/**
 * Shapes, not entropy. A high-entropy-string detector flags ULIDs, hashes,
 * base64 fixtures and minified bundles, and a guard that cries wolf is one
 * somebody switches off — 007 recorded that about two stricter guards in a row.
 *
 * So each pattern names a credential FORM that a real provider issues. Adding
 * one is a deliberate edit, which is the same property the surface list has.
 */
const CREDENTIAL_SHAPES: { name: string; re: RegExp }[] = [
  // AWS and S3-compatible access keys. `AKIA`/`ASIA` are AWS's own prefixes.
  { name: 'an AWS access key id', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  /**
   * A database URL carrying a password TO A REMOTE HOST.
   *
   * The loopback exclusion is the one judgement in this list, and it is a
   * judgement rather than a convenience. Its first run was red on eight files,
   * every one of them
   * `postgres://sih:localsecret@127.0.0.1:5432/sih` — the development
   * container's password, whose value is also in `docker-compose.yml`, which is
   * the file that SETS it. A credential that opens a service bound to loopback,
   * created by a file in the same tree, is not a secret in any sense FR-016 is
   * about; treating it as one would mean either eight exemptions or a guard
   * somebody turns off.
   *
   * What it still catches is the case that matters: a password to a host
   * somebody else can reach. The scheme, the `:pass@` and a non-loopback host
   * are all required, so `postgres://sih@db.example.com/sih` (no password) and
   * the local URL above are both silent, and a managed connection string is
   * not.
   */
  {
    name: 'a database URL with a password in it',
    re: /\b(?:postgres|postgresql|mysql):\/\/[^\s:'"@]+:[^\s'"@]{3,}@(?!localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|db:|postgres:)/,
  },
  // A JWT: three base64url segments, and a header long enough to be real.
  { name: 'a JSON Web Token', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  // Provider tokens whose prefixes are documented and stable.
  { name: 'a GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'a Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'a Stripe secret key', re: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
  { name: 'a Supabase service_role key', re: /\bsbp_[A-Za-z0-9]{36,}\b/ },
  // A PEM private key, of any kind.
  { name: 'a private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
];

/**
 * Files whose whole job is to show the SHAPE of a credential without being one.
 *
 * An explicit list, not a pattern: an exemption somebody can argue with in
 * review, rather than one that slips in because a filename happened to match.
 */
const ALLOWED = new Set([
  'apps/api/tests/unit/no-credentials-in-the-tree.spec.ts',
]);

/** Binary and generated files, which carry no reviewable text. */
const SKIP = /\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|jar|keystore|lock)$|^pnpm-lock|(^|\/)dist\//;

describe('010/FR-016 — nothing credential-shaped is in the repository', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.length > 0 && !SKIP.test(f) && !ALLOWED.has(f));

  it('scans a real, non-trivial file list — so a green result is not an empty one', () => {
    /**
     * VACUOUSLY TRUE OVER AN EMPTY LIST, which is the failure `hooks-before-return`
     * had: it read a path that stopped existing, found no offenders, and went on
     * passing. `expect(found).toEqual([])` says nothing if nothing was read.
     */
    expect(files.length).toBeGreaterThan(300);
  });

  it('finds no credential-shaped string in any tracked file', () => {
    const found: string[] = [];
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(join(REPO, file), 'utf8');
      } catch {
        continue; // A submodule or a deleted-but-staged path.
      }
      for (const shape of CREDENTIAL_SHAPES) {
        const m = shape.re.exec(text);
        if (!m) continue;
        const line = text.slice(0, m.index).split('\n').length;
        // LOCATED, never quoted: printing the match would put the credential in
        // a CI log, which is the thing this exists to prevent.
        found.push(`${file}:${line} looks like ${shape.name}`);
      }
    }
    expect(found).toEqual([]);
  });

  /**
   * VERIFIED BY BREAKING IT, in the test rather than by hand — "care is not a
   * control" is the task's own wording, and a guard that has only ever passed
   * is not a guard.
   *
   * Planted against the PATTERNS rather than in a file, because writing a real
   * credential-shaped string into the tree to prove the scanner works is how
   * one gets committed.
   */
  it('every shape it claims to catch, it catches', () => {
    const planted: Record<string, string> = {
      'an AWS access key id': `AKIA${'IOSFODNN7EXAMPLE'}`,
      'a database URL with a password in it': `postgres://sih:${'hunter2'}@db.example.com:5432/sih`,
      'a JSON Web Token': [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        'eyJzdWIiOiJub2JvZHkifQ',
        'c2lnbmF0dXJlLWdvZXMtaGVyZQ',
      ].join('.'),
      'a GitHub token': `gh${'p'}_${'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'}`,
      'a Slack token': ['xox' + 'b', '0'.repeat(12), '0'.repeat(12), 'abcdefghijklmnop'].join('-'),
      'a Stripe secret key': `sk_${'test'}_${'0123456789abcdefghijklmn'}`,
      'a Supabase service_role key': `sbp_${'0123456789abcdefghijklmnopqrstuvwxyz'}`,
      'a private key block': `-----BEGIN ${'PRIVATE'} KEY-----`,
    };
    // Every shape has a planted example, so adding a pattern without a case
    // fails here rather than being silently untested.
    expect(Object.keys(planted).sort()).toEqual(CREDENTIAL_SHAPES.map((s) => s.name).sort());
    for (const shape of CREDENTIAL_SHAPES) {
      expect(shape.re.test(planted[shape.name]!)).toBe(true);
    }
  });

  /**
   * AND IT DOES NOT FIRE ON THE THINGS THIS REPOSITORY IS FULL OF. The reason
   * to state these is that each one is why a naive entropy check would be
   * switched off within a day.
   */
  it('does not fire on ULIDs, local URLs, or an example that carries no password', () => {
    const innocent = [
      '01M2MGFYRR3EYHBPVVE6WD263R',
      'postgres://sih@127.0.0.1:5432/sih',
      // The development container's own URL, password and all — see the note on
      // the pattern for why this is silent and a remote one is not.
      'postgres://sih:localsecret@127.0.0.1:5432/sih',
      'postgres://sih:localsecret@localhost:5432/sih',
      'DATABASE_URL=',
      'https://api.trycloudflare.com',
      'sha256-abcdefghijklmnopqrstuvwxyz0123456789ABCDEF',
    ];
    for (const text of innocent) {
      for (const shape of CREDENTIAL_SHAPES) {
        expect({ text, shape: shape.name, hit: shape.re.test(text) }).toEqual({
          text,
          shape: shape.name,
          hit: false,
        });
      }
    }
  });
});
