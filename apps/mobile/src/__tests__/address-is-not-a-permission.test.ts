import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 009, `contracts/backend-address.md` §6, which carries FR-007.
 *
 * The backend address is a DESTINATION, never a permission.
 *
 * Constitution Principle II decides visibility once, on the server. An address
 * that changed what the app displayed would be a second visibility decision
 * living on the client - the thing that principle exists to forbid, arriving by
 * a route nobody would think to look down. A person who points the app at a
 * different server gets THAT server's answers; they do not get more of this
 * one's.
 *
 * So the address may be read where the data layer is CONSTRUCTED, and nowhere
 * else. The allow-list below is the whole of that construction path, and it is
 * meant to stay short: every name added to it is a new place where a client-side
 * read could start deciding something.
 *
 * STRUCTURAL, so it fails when the dependency appears rather than waiting for a
 * screen that exercises it - the same shape as
 * `post-card-reads-nothing.test.ts` and
 * `apps/api/tests/unit/feed-does-not-read-place-follows.spec.ts`.
 *
 * IT WALKS THE DIRECTORIES AND ASSERTS IT FOUND FILES. `expect(offenders)
 * .toEqual([])` is vacuously true over an empty list, which is exactly how
 * `hooks-before-return.test.ts` went green in the same run that reported 253
 * tests passing, after its subject moved out from under it.
 */
const SRC = join(__dirname, '..');

/** Where constructing the data layer legitimately happens. */
const ALLOWED = new Set(['data-provider.tsx', 'settings-store.ts', 'config.ts', 'App.tsx']);

/** Directories whose job is to render or to gate - never to choose a backend. */
const SCANNED = ['screens', 'features', 'components', 'ui'];

const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('the backend address is a destination, not a permission (FR-007)', () => {
  const files = SCANNED.flatMap((d) => walk(join(SRC, d))).filter(
    (f) => !ALLOWED.has(f.split('/').pop() as string),
  );

  it('found the files it is supposed to be scanning', () => {
    // If this number ever collapses, the guard has lost its subject and every
    // assertion below is vacuous. It is the check this project learned to add
    // the expensive way.
    expect(files.length).toBeGreaterThan(40);
  });

  it('no rendering or gating module reads the stored backend address', () => {
    const offenders = files.filter((f) => {
      const src = strip(readFileSync(f, 'utf8'));
      return (
        /\bsih\.backend\.url\b/.test(src) ||
        /\bgetBaseUrl\b/.test(src) ||
        /\bsetBaseUrl\b/.test(src) ||
        /\bPersistentSettingsStore\b/.test(src) ||
        /\bAPI_BASE_URL\b/.test(src)
      );
    });
    expect(offenders.map((f) => f.replace(`${SRC}/`, ''))).toEqual([]);
  });

  it('no rendering or gating module imports the settings store', () => {
    const offenders = files.filter((f) => {
      const src = strip(readFileSync(f, 'utf8'));
      return /from\s+['"][^'"]*settings-store['"]/.test(src);
    });
    expect(offenders.map((f) => f.replace(`${SRC}/`, ''))).toEqual([]);
  });

  /**
   * The sign-in surface is the one place a person TYPES an address, and it is
   * in `features/`. It takes the value as a prop like every other screen - it
   * does not reach for the store - so it is scanned like everything else and
   * must stay clean. That is the whole point of the container/screen split.
   */
  it('the sign-in screen takes the address as a prop rather than reading it', () => {
    const src = strip(readFileSync(join(SRC, 'features/auth/SignInScreen.tsx'), 'utf8'));
    expect(src).not.toMatch(/useData\b/);
    expect(src).not.toMatch(/settings-store/);
  });
});
