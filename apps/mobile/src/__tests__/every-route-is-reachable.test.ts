import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A ROUTE WITH NO WAY IN IS NOT A SCREEN — 012/T037, FR-015, SC-003.
 *
 * `people-search` was a declared `Route` variant with NO case in the renderer
 * and nothing anywhere pushing it: a screen that could not be reached AND could
 * not have drawn itself if it had been. Two halves missing rather than one, and
 * it cost nothing at runtime because a variant nobody constructs is simply
 * never constructed — so typecheck, lint and every test stayed green over a
 * screen that did not exist.
 *
 * `create-place` was the ordinary version: a renderer and no caller. It even
 * carried `initialName` and `initialLocality`, parameters that only make sense
 * arriving from a place search which found nothing — built, typed, wired to
 * accept them, and never called.
 *
 * TWO QUESTIONS, because the defect came in two halves and a guard that asks
 * only one of them passes over the other:
 *
 *   1. Does every declared route have a case in the renderer?
 *   2. Does something construct it?
 */
const SRC = join(__dirname, '..');
const APP = join(SRC, 'App.tsx');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

const stripComments = (raw: string): string =>
  raw
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * The `Route` union's variant names.
 *
 * Read from the union declaration rather than from a hand-kept list, because a
 * hand-kept list only covers the routes somebody remembered — which is 004's
 * `auth-surface` guard, whose first version was exactly that and missed the
 * second occurrence of the defect it was written for.
 */
function declaredRoutes(appSrc: string): string[] {
  const start = appSrc.indexOf('export type Route =');
  if (start === -1) throw new Error('Route union not found — this guard has lost its subject');
  const end = appSrc.indexOf('\n\n', start);
  const union = appSrc.slice(start, end === -1 ? undefined : end);
  return [...union.matchAll(/\{\s*name:\s*'([^']+)'/g)].map((m) => m[1]!);
}

describe('every declared route is reachable (FR-015, SC-003)', () => {
  const appSrc = stripComments(readFileSync(APP, 'utf8'));
  const routes = declaredRoutes(appSrc);

  it('found the Route union', () => {
    // `hooks-before-return.test.ts` passed GREEN for a whole feature after its
    // subject moved out from under it: no `export function`, so no blocks, so
    // no offenders. A guard over an empty list is vacuously true, so this one
    // asserts it found something before asserting anything about it.
    expect(routes.length).toBeGreaterThan(15);
  });

  it('every route has a case in the renderer', () => {
    const missing = routes.filter((r) => !appSrc.includes(`case '${r}'`));
    expect(missing).toEqual([]);
  });

  it('every route is constructed somewhere', () => {
    /**
     * The tab destinations are not pushed — they are selected by the tab bar,
     * which reads `TABS` rather than building a `Route`. Naming them here is a
     * short, justified exemption rather than a loophole: each one is visibly
     * reachable as a tab, which is the property FR-015 is about.
     */
    const TABS_NOT_PUSHED = new Set(['feed', 'discover', 'chats', 'notifications', 'profile']);

    /**
     * `overlay` IS UNREACHABLE HERE ON PURPOSE, and this is the one exemption
     * that is a design decision rather than a convenience.
     *
     * It is the downstream seam: `{ name: 'overlay', screen: '<key>' }` looks
     * its renderer up in `OVERLAY_SCREENS`, which is `{}` upstream and filled
     * in by a private fork. So upstream declares the route, renders it, and
     * constructs it nowhere — which is precisely the shape this guard exists to
     * fail on.
     *
     * CLAUDE.md already names this trap: "an empty overlay cannot tell a
     * working seam from a broken one", which is why five suites drive the seams
     * NON-EMPTY rather than trusting them. This guard cannot be one of them —
     * its subject is the route table, not the registry — so the exemption is
     * named and the reason written down, instead of the guard being softened
     * into something that would also pass over the next `people-search`.
     */
    const OVERLAY_SEAM = new Set(['overlay']);

    const everySource = sourceFiles(SRC)
      .map((f) => stripComments(readFileSync(f, 'utf8')))
      .join('\n');

    const unreachable = routes.filter((r) => {
      if (TABS_NOT_PUSHED.has(r) || OVERLAY_SEAM.has(r)) return false;
      // A construction is `{ name: 'x'` anywhere OUTSIDE the union itself.
      const uses = [...everySource.matchAll(new RegExp(`\\{\\s*name:\\s*'${r}'`, 'g'))].length;
      // The union declares each variant exactly once; anything beyond that is
      // a caller building one.
      return uses <= 1;
    });

    expect(unreachable).toEqual([]);
  });
});
