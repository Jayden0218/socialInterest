import { useColorScheme } from 'react-native';
import { dark, light, type Palette } from './tokens';

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
