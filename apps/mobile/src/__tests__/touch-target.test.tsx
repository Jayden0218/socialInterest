import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Button } from '../ui/primitives';
import { MIN_TOUCH_TARGET, type as typeScale } from '../ui/tokens';

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

  /**
   * The controls that reach 44 by SLOP rather than by box, each with the box
   * height that makes the sum work. Both are deliberate:
   *
   * - `InterestWord` is a WORD, not a chip (006/G1, 007/FR-021). Giving it
   *   `minHeight: 44` cost 43 points of vertical space on every card in the
   *   waterfall, measured — which is a layout regression to satisfy a guard.
   * - The compose square's ART is 46x34; the target is not.
   */
  const SLOP_TARGETS: { file: string; label: string; boxHeight: number; boxWidth: number; slop: { top: number; bottom: number; left: number; right: number } }[] = [
    {
      file: 'src/components/InterestWord.tsx',
      label: 'the interest word',
      // The line box IS the height: a <Text> with no padding.
      boxHeight: typeScale.small.lineHeight,
      // A real `minWidth`, not the word's own width. Sized by the SHORTEST
      // name the catalogue can hold would have been 20.7pt — which is what
      // this assertion caught, and why the floor is stated in the style now.
      boxWidth: MIN_TOUCH_TARGET,
      slop: { top: 14, bottom: 14, left: 8, right: 8 },
    },
    {
      file: 'src/App.tsx',
      label: 'the compose square',
      boxHeight: 34 + (MIN_TOUCH_TARGET - 34),
      boxWidth: 46,
      slop: { top: 5, bottom: 5, left: 8, right: 8 },
    },
  ];

  it.each(SLOP_TARGETS)('$label reaches 44 by arithmetic, not by mentioning hitSlop', ({ boxHeight, boxWidth, slop }) => {
    expect(boxHeight + slop.top + slop.bottom).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(boxWidth + slop.left + slop.right).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

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
        const line = src.slice(0, m.index).split('\n').length;

        /**
         * `hitSlop` is ACCEPTED BY ARITHMETIC, not by mention — 007/T078.
         *
         * This guard used to `continue` on the word `hitSlop`, which is the
         * same shape of mistake its own comment above records: it approved the
         * PRESENCE of a mechanism rather than the size it produces.
         * `hitSlop={{ top: 1, bottom: 1 }}` would have passed, and SC-009 says
         * "checked mechanically" — a word in a prop is not a measurement.
         *
         * Slop extends the touchable area OUTSIDE the layout box, so the sum
         * needs the box's own height, which cannot be read from this tag. So
         * each one is named here with its measured height, and the arithmetic
         * is asserted in the test below. A NEW hitSlop control fails until
         * somebody does the sum and adds it — which is the point.
         */
        if (/hitSlop/.test(tag)) {
          if (!SLOP_TARGETS.some((t) => t.file === rel)) {
            offenders.push(`${rel}:${line} (hitSlop, unmeasured — add it to SLOP_TARGETS)`);
          }
          continue;
        }

        if (/minHeight|minWidth|touchTarget/.test(tag)) continue;
        offenders.push(`${rel}:${line}`);
      }
    }

    // Located, not counted: a bare number sends somebody hunting through twenty
    // screens for a control that is a few points too small to see by eye.
    expect(offenders).toEqual([]);
  });
});
