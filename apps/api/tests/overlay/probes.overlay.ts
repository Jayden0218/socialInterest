/**
 * OVERLAY ROUTING PROBES — empty upstream, filled in by a downstream fork.
 *
 * See ./README.md. One entry per `built: true` surface in
 * `surfaces.overlay.ts`; `surface-routing.spec.ts` composes these with its own
 * base probes and its completeness check covers both lists together, so an
 * overlay surface with no probe here fails exactly as a base one does.
 *
 * A probe's job is to invoke the REAL read path. The assertion is the spy in
 * `Ctx`, not anything the probe returns — a probe that builds its own answer
 * proves nothing about whether the product consults the boundary.
 */
import type { Probe } from '../visibility/probe';

export const OVERLAY_PROBES: readonly Probe[] = [];
