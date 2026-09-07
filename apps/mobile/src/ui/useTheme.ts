import { useColorScheme } from 'react-native';
import { dark, light, type Palette } from './tokens';
import { activePalette } from './theme';

/**
 * 006/FR-017. The palette for the current colour scheme.
 *
 * DARK IS THE DEFAULT, including when the platform reports nothing. The brand is
 * a dark green; an app that opens pale and turns green once a setting is read is
 * an app whose identity depends on a preference.
 *
 * Returns the whole palette rather than a hook per token so a component reads
 * one thing and destructures - `const { bg, text } = useTheme()` - instead of
 * five hook calls that can each be forgotten separately.
 */
export function useTheme(): Palette {
  /**
   * ONE PALETTE FOR THE WHOLE APP, and deliberately not the platform's yet.
   *
   * `theme.ts` resolves its alias layer against `activePalette` at module load,
   * because ~40 screens read `theme.color.bg` and cannot call a hook. If this
   * followed `useColorScheme()` while that stayed fixed, the app would render
   * with TWO palettes at once - and it did: the first capture after `PostCard`
   * landed showed white cards inside dark green chrome, because the browser
   * reports `light` and the alias layer is dark.
   *
   * That is not "dark mode is broken", it is two sources of truth. Following the
   * platform is US3's job (T035, T036), once every screen reads tokens through a
   * hook and there is one source to follow. Until then this returns what the
   * alias layer returns, and the app is one colour.
   */
  return activePalette;
}

/** Exported for the day US3 wires the platform preference through. */
export function platformPalette(): Palette {
  return useColorScheme() === 'light' ? light : dark;
}

/**
 * The same choice, outside React.
 *
 * A StyleSheet built at module scope cannot call a hook, and some already are.
 * Exposed deliberately rather than left for each caller to reinvent with its own
 * idea of the default.
 */
export function paletteFor(scheme: 'light' | 'dark' | null | undefined): Palette {
  return scheme === 'light' ? light : dark;
}
