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
   * A hand-rolled `Pressable` must state a size, a hitSlop, or be a whole row
   * (a card, a list item) whose height comes from its content.
   *
   * `ALLOWED` is an explicit list rather than a pattern, so adding one is a
   * decision somebody makes on purpose and can be argued with in review - not
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

  it('every hand-rolled Pressable sizes itself, or is listed as a whole-row target', () => {
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
      const src = readFileSync(file, 'utf8');
      if (!src.includes('<Pressable')) continue;
      // The file uses a bare Pressable and is not exempt, so it must say how big.
      if (!/minHeight|minWidth|hitSlop|touchTarget/.test(src)) offenders.push(rel);
    }

    expect(offenders).toEqual([]);
  });
});
