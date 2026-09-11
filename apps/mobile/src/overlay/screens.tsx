import type { ReactElement } from 'react';
import type { Route } from '../App';

/**
 * OVERLAY SCREENS — empty upstream, filled in by a downstream fork.
 *
 * See ./README.md.
 *
 * THIS IS FOR *ADDING* A SCREEN, NOT REPLACING ONE. Replacing is already
 * possible and needs nothing here: every container has its own file in
 * `../screens/`, so a fork swaps `ProfileContainer.tsx` for its own and the
 * barrel, `App.tsx` and this registry are all untouched. What a fork could NOT
 * do is add a screen upstream has no route for — `Route` is a discriminated
 * union and the stack switch reads it, so a new destination meant editing both.
 *
 * One route variant carries all of them: `{ name: 'overlay', screen: '<key>' }`
 * looks its renderer up here. The union keeps its exhaustiveness, `App.tsx`
 * gains one case rather than one per fork screen, and upstream adding a route
 * never touches the same lines a fork does.
 *
 * An overlay screen is a PUSHED screen, so it has no tab bar — `App` renders
 * that only at the root of the stack (005/J-21, which cost two device runs).
 */
export interface OverlayScreenProps {
  /** Whatever the route carried. Untyped by construction: it is the fork's. */
  params: Record<string, unknown>;
  /** Push another destination, including `{ name: 'overlay', screen: ... }`. */
  push: (route: Route) => void;
  /** Go back one. The header's Back button does this too. */
  pop: () => void;
  /** Push, or divert to sign-in when there is no identity yet. */
  requireSignIn: (route: Route) => void;
  signedIn: boolean;
}

export interface OverlayScreen {
  /** Shown in the header. Without it the bar would read "overlay" on each one. */
  title: string;
  render: (props: OverlayScreenProps) => ReactElement;
}

export const OVERLAY_SCREENS: Record<string, OverlayScreen> = {};
