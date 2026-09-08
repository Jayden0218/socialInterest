import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Button } from '../ui/primitives';
import { MIN_TOUCH_TARGET } from '../ui/tokens';

/**
 * 006/SC-007, FR-020. Below 44x44 a control is not reliably tappable, and
 * "it looks big enough" is not a measurement.
 *
 * Two halves, because neither is sufficient:
 *
 *   1. The SHARED control is rendered and its style read, so the floor is
 *      checked on the thing the app actually builds rather than on source text.
 *   2. Every hand-rolled `Pressable` is found statically, because a screen that
 *      bypasses the primitive bypasses the guarantee with it.
 */
describe('every control is reliably tappable', () => {
  it('the shared Button declares the minimum, rendered rather than grepped', () => {
    const { getByTestId } = render(<Button testID="probe" label="Tap" onPress={() => undefined} />);
    const style = StyleSheet.flatten(getByTestId('probe').props.style) as { minHeight?: number };
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it('a disabled Button keeps its target, so it can still be found and reported', () => {
    const { getByTestId } = render(<Button testID="probe" label="Tap" disabled />);
    const style = StyleSheet.flatten(getByTestId('probe').props.style) as { minHeight?: number };
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  /**
   * 007/T057, SC-009 — PER PRESSABLE, not per file.
   *
   * The first version asked whether a FILE mentioned `minHeight`, `hitSlop` or
   * `touchTarget` anywhere in it. That passes a file holding two Pressables
   * where only one is sized, and by Phase 5 several files hold four — the tab
   * bar alone has six. A guard that cannot tell which control it approved is a
   * guard that approves the next one for free.
   *
   * So this walks each opening `<Pressable ...>` tag and asks about THAT tag.
   *
   * `ALLOWED` is an explicit list rather than a pattern, so adding one is a
   * decision somebody makes on purpose and can be argued with in review — not
   * something that slips in because it happened to match a regex.
   */
  const ALLOWED = new Set([
    // Whole-row targets: the press area is the card or the row, which is far
    // taller than 44 by construction - adding a minHeight would state a floor
    // that the content already clears several times over.
    'src/components/PostCard.tsx',
    'src/features/discover/InterestSearchScreen.tsx',
    'src/features/discover/InterestScreen.tsx',
    'src/features/posts/PostDetailScreen.tsx',
    'src/features/publish/MediaPickerScreen.tsx',
  ]);

  it('every hand-rolled Pressable sizes ITSELF, or is a listed whole-row target', () => {
    const SRC = join(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        if (entry === '__tests__' || entry === 'node_modules') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.tsx')) files.push(full);
      }
    };
    walk(SRC);

    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.slice(file.indexOf('src/'));
      if (rel === 'src/ui/primitives.tsx' || ALLOWED.has(rel)) continue;

      // Comments blanked line by line, so a doc comment showing a Pressable as
      // an example is not counted and a reported line number still points at
      // the real one.
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        /**
         * Arrow functions neutralised, or the tag match ends early — the exact
         * trap `text-has-colour.test.ts` records. `<Pressable onPress={() =>
         * open()} style={touchTarget}>` contains a `>` inside a prop, so
         * scanning to the first `>` stops before the style and accuses a
         * correct control. This guard's own first run reported eight files that
         * way, and a guard that cries wolf is one somebody switches off.
         */
        .replace(/=>/g, '=\u00bb');

      for (const m of src.matchAll(/<Pressable\b[\s\S]*?>/g)) {
        const tag = m[0];
        if (/minHeight|minWidth|hitSlop|touchTarget/.test(tag)) continue;
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${rel}:${line}`);
      }
    }

    // Located, not counted: a bare number sends somebody hunting through twenty
    // screens for a control that is a few points too small to see by eye.
    expect(offenders).toEqual([]);
  });
});
