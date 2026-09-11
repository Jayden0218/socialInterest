/**
 * OVERLAY ROUTE SNAPSHOTS — empty upstream, filled in by a downstream fork.
 *
 * See ./README.md. `integration/auth-surface.spec.ts` enumerates every route
 * the app registers and compares the public and operator sets to these lists
 * plus its own base ones.
 *
 * The snapshot is still BOTH DIRECTIONS for overlay routes. Declaring a route
 * here does not make it public — it records that it is, so that a route which
 * stops being public fails, and one that starts being public without anybody
 * deciding so fails too. That is the whole value of the guard, and it is the
 * reason these are enumerated rather than pattern-matched: a fork that listed
 * `POST /private/*` would be opting its own writes out of the check.
 */

/** Routes this build adds that are readable WITHOUT a token. */
export const OVERLAY_PUBLIC_ROUTES: readonly string[] = [];

/** Routes this build adds that require `OperatorGuard`. */
export const OVERLAY_OPERATOR_ROUTES: readonly string[] = [];
