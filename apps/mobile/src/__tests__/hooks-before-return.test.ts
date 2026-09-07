import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
 */
describe('containers declare their hooks before returning', () => {
  const source = readFileSync(resolve(__dirname, '../screens/index.tsx'), 'utf8');

  it('no hook appears after ANY return in an exported container', () => {
    const offenders: string[] = [];
    // Split on the top-level function declarations, which all start at column 0.
    const blocks = source.split(/\nexport function /).slice(1);
    for (const block of blocks) {
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
      if (hook) offenders.push(`${name}: ${hook[0].trim()}`);
    }
    expect(offenders).toEqual([]);
  });
});
