import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * NO HOOK MAY BE DECLARED AFTER A CONTAINER'S `return`.
 *
 * Written after doing exactly that: `toggleSave` was inserted below the return
 * in PostDetailContainer, so the const was never initialised and the closure
 * that called it hit the temporal dead zone. The save button did nothing.
 *
 * Typecheck was clean - the reference is inside a callback, so TypeScript sees
 * a legal forward reference. Lint was clean. All 50 mobile tests passed, because
 * they render screens with props and never press a container's button. Only
 * driving the running app found it, which is the fifth time that has been the
 * only thing that could.
 *
 * This is the cheap half of the guard: a text check that costs nothing and
 * catches the whole class before it reaches a browser.
 *
 * ---------------------------------------------------------------------------
 * IT READ ONE FILE, AND THAT FILE STOPPED HOLDING THE CONTAINERS.
 *
 * Until 2026-09-11 this opened `../screens/index.tsx` by name, because every
 * container lived in it. Splitting them into one file each left that path
 * pointing at a barrel of re-export lines - no `export function`, so no blocks,
 * so no offenders, so GREEN. The guard did not fail when its subject moved; it
 * passed while covering nothing, which is worse, and it passed on the very run
 * that moved them.
 *
 * It reads the DIRECTORY now, and the coverage assertion below exists because
 * of that hour: a guard that finds nothing to inspect must fail, not pass.
 * ---------------------------------------------------------------------------
 */
describe('containers declare their hooks before returning', () => {
  const SCREENS = resolve(__dirname, '../screens');
  const files = readdirSync(SCREENS)
    .filter((f) => f.endsWith('.tsx') && f !== 'index.tsx')
    .sort();

  const blocks = files.flatMap((file) => {
    const source = readFileSync(join(SCREENS, file), 'utf8');
    // Top-level function declarations, which all start at column 0.
    return source.split(/\nexport function /).slice(1).map((block) => ({ file, block }));
  });

  /**
   * THE GUARD IS ACTUALLY LOOKING AT SOMETHING.
   *
   * Not a count for its own sake: `expect(offenders).toEqual([])` is vacuously
   * true over an empty list, so without this the whole suite reports success
   * whenever the containers move, get renamed, or land in a subdirectory. That
   * is precisely the failure the note above records.
   */
  it('finds the container files to scan', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(blocks.length).toBeGreaterThan(20);
  });

  it('no hook appears after ANY return in an exported container', () => {
    const offenders: string[] = [];
    for (const { file, block } of blocks) {
      const name = block.slice(0, block.indexOf('(' as string));
      // ANY return, not the final one. The first version of this test looked
      // only for `return (` at the end, so it passed against a hook placed
      // after `if (error) return <Failed/>` - which is what actually broke:
      // "Rendered more hooks than during the previous render", because the hook
      // runs on some renders and not others.
      const returnAt = block.search(/\n  (return|if \(.*\) return)/);
      if (returnAt === -1) continue;
      const tail = block.slice(returnAt);
      const hook = /\n  const \w+ = (useCallback|useMemo)\(|\n  use(Effect|State)\(/.exec(tail);
      if (hook) offenders.push(`${file} ${name}: ${hook[0].trim()}`);
    }
    expect(offenders).toEqual([]);
  });
});
