# `tests/overlay/` — the seam a downstream fork owns

Every file here is **empty in this repository and is meant to stay empty.** A
downstream fork (a private repo tracking this one as upstream) fills them in;
upstream never does. That is the whole design: upstream and downstream edit
disjoint files, so a sync merges cleanly instead of colliding in a guard.

## Why this exists

Three guards enumerate the whole API surface and pin the result as a literal:

| Guard | Pinned |
|---|---|
| `visibility/matrix.spec.ts` | `BASE_SURFACES.length`, the combined assertion total |
| `visibility/surface-routing.spec.ts` | a probe per built surface |
| `integration/auth-surface.spec.ts` | the public and operator route snapshots |

They are pinned on purpose — raising a number is meant to be a deliberate,
reviewable edit, and that property is **not** being weakened here. The problem
is only that *both* upstream and a fork have to raise the same literal whenever
either adds a surface, so those files conflict on every single sync.

The fix is to pin the number that is upstream's (`BASE_*`) and *compute* the
composed expectation from base plus whatever the overlay contributes. Upstream
going 16 → 17 touches the base list and the literal beside it. A fork adding two
surfaces touches only this directory. Neither edit is in a file the other side
writes.

## What a fork adds here

- `surfaces.overlay.ts` — `OVERLAY_SURFACES`, `OVERLAY_EVER_BUILT`
- `probes.overlay.ts` — `OVERLAY_PROBES`, one per built overlay surface
- `routes.overlay.ts` — `OVERLAY_PUBLIC_ROUTES`, `OVERLAY_OPERATOR_ROUTES`

## What this does NOT relax

**Constitution II is untouched.** An overlay surface is a new row in the same
decision table, decided by the same `VisibilityFilter`. It is not permission to
add a second predicate, and `surface-routing.spec.ts` still demands a probe
proving each overlay surface *consults* the boundary before the matrix will
count it. An overlay surface with no probe fails, exactly as a base one does.

Concretely, the guarantees that still hold with a non-empty overlay:

- an overlay surface that is `built` but unprobed fails `surface-routing`
- an overlay surface listed in `OVERLAY_EVER_BUILT` that regresses to
  `built: false` fails the matrix ratchet
- an overlay route that is public without being declared here fails
  `auth-surface` — the snapshot is still both-directions
- an overlay name colliding with a base name fails (see `surfaces.ts`), because
  two surfaces answering to one name would let one probe cover both

**Principle V applies to whatever a fork puts here.** A green upstream run says
nothing about the composed downstream build; the fork runs these suites against
its own composition, and registers the divergence.
