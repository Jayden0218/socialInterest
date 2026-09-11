/**
 * OVERLAY SURFACES — empty upstream, filled in by a downstream fork.
 *
 * See ./README.md. Upstream never edits this file; that is what keeps
 * `visibility/surfaces.ts` and `visibility/matrix.spec.ts` conflict-free across
 * a sync.
 *
 * The `Surface` type is imported from the base list rather than restated. It is
 * a type-only import, so the cycle (surfaces.ts -> this file -> surfaces.ts) is
 * erased at compile time and there is no runtime cycle. Restating the interface
 * would be two declarations agreeing with each other and with nothing else.
 */
import type { Surface } from '../visibility/surfaces';

/**
 * Surfaces this build adds on top of `BASE_SURFACES`.
 *
 * Every entry needs a routing probe in `probes.overlay.ts` before it may be
 * `built: true` — `surface-routing.spec.ts` fails otherwise, which is the point:
 * a surface that looks covered is the expensive mistake.
 */
export const OVERLAY_SURFACES: readonly Surface[] = [];

/**
 * The overlay half of the ratchet. Append-only, never edited down: a name here
 * MUST be built, so a surface that silently stops being covered fails loudly
 * instead of reporting a smaller green number.
 */
export const OVERLAY_EVER_BUILT: readonly string[] = [];
