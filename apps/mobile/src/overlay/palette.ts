import type { Palette } from '../ui/tokens';

/**
 * OVERLAY PALETTES — empty upstream, filled in by a downstream fork.
 *
 * See ./README.md. A fork supplies its own brand here and every consumer picks
 * it up: the 41 screens reading `ui/theme`, the generated interest colours, and
 * — this is the part that matters — the contrast, one-accent and
 * interest-colour guards, which all read `light`/`dark` from `ui/tokens`.
 *
 * THAT IS WHY THIS RESOLVES INSIDE `tokens.ts` AND NOT `theme.ts`. The obvious
 * place to put a palette override is `theme.ts`, where `activePalette` lives.
 * It is the wrong layer: the guards import from `tokens.ts`, so an override one
 * level above would leave a fork's palette rendering in the app while every
 * accessibility check still measured upstream's. Two sources of truth for one
 * fact — which is exactly the 006 defect that showed white cards inside dark
 * green chrome, arriving by a different route.
 *
 * Resolved at module scope, deliberately. Screens read the palette at import
 * time (`useTheme` does not follow the platform for the same reason), so a
 * build has ONE palette and a fork picks it here rather than at runtime.
 *
 * The `Palette` type is imported from `tokens.ts` rather than restated. It is a
 * type-only import, so the cycle is erased at compile time and there is no
 * runtime cycle.
 *
 * A fork supplying `light` should supply `dark` too: `contrast.test.ts` asserts
 * the two define exactly the same token names, because a token missing from one
 * resolves to `undefined`, react-native drops the style, and text inherits the
 * platform's black.
 */
export const OVERLAY_PALETTES: { light?: Palette; dark?: Palette } = {};
