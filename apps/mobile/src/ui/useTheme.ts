import { useColorScheme } from 'react-native';
import { dark, light, type Palette } from './tokens';
import { activePalette } from './theme';

/**
 * 006/FR-017. The palette for the current colour scheme.
 *
 * LIGHT IS THE DEFAULT under 007, including when the platform reports nothing.
 * The approved design is warm paper with one accent; an app that opens dark and
 * turns pale once a setting is read is an app whose identity depends on a
 * preference.
 *
 * Returns the whole palette rather than a hook per token so a component reads
 * one thing and destructures - `const { bg, text } = useTheme()` - instead of
 * five hook calls that can each be forgotten separately.
 */
export function useTheme(): Palette {
  /**
   * ONE PALETTE FOR THE WHOLE APP, and deliberately not the platform's yet.
   *
   * Screens read `activePalette` at MODULE SCOPE - a style object built once at
   * import time cannot call a hook. If this hook followed `useColorScheme()`
   * while those stayed fixed, the app would render with TWO palettes at once,
   * and it did: the first capture after `PostCard` landed showed white cards
   * inside dark green chrome, because the browser reports `light` and the
   * module-scope reads are dark.
   *
   * That is not "dark mode is broken", it is two sources of truth. Following the
   * platform needs every screen to build its styles INSIDE the component, which
   * is a change of shape rather than of names and is not what 006 bought. Until
   * then this returns the same palette everything else reads, and the app is one
   * colour.
   */
  return activePalette;
}

/** Exported for the day US3 wires the platform preference through. */
export function platformPalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

/**
 * The same choice, outside React.
 *
 * A StyleSheet built at module scope cannot call a hook, and some already are.
 * Exposed deliberately rather than left for each caller to reinvent with its own
 * idea of the default.
 */
export function paletteFor(scheme: 'light' | 'dark' | null | undefined): Palette {
  return scheme === 'dark' ? dark : light;
}
