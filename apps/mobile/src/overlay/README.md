# `src/overlay/` — the mobile seam a downstream fork owns

Empty in this repository and meant to stay empty. Companion to
`apps/api/src/overlay/` on the server side.

## `palette.ts` — the brand

A fork supplies `OVERLAY_PALETTES.light` (and `.dark`) and every consumer picks
it up: the 41 screens reading `ui/theme`, the generated interest colours, and
the contrast, one-accent and interest-colour guards.

**It resolves inside `ui/tokens.ts`, not `ui/theme.ts`, and that is the whole
design.** `theme.ts` is where `activePalette` lives and is the obvious place to
put an override. It is the wrong layer: the guards import `light`/`dark` from
`tokens.ts`, so an override one level above would leave a fork's palette
rendering in the app while every accessibility check still measured upstream's.
Two sources of truth for one fact — the 006 defect that showed white cards
inside dark green chrome, arriving by a different route.

The consequence is the point: **a fork's palette is held to the same floor.**
`contrast.test.ts` enumerates the whole generated colour space — 360 hues × 2
depths, both palettes — of whatever is active, and
`__tests__/palette-overlay.test.ts` proves a failing overlay palette is caught
rather than assuming it would be.

Supply `dark` whenever you supply `light`: `contrast.test.ts` asserts both
define exactly the same token names, because a token missing from one resolves
to `undefined`, react-native drops the style, and text inherits the platform's
black.

`baseLight` and `baseDark` stay exported, so a fork can spread one and change an
accent rather than restating forty values it does not care about. Resolution is
at module scope because screens read the palette at import time — one palette
per build, which is also why `useTheme` does not follow the platform.

## `screens.tsx` — adding a screen

**For adding, not replacing.** Replacing needs nothing here: every container has
its own file in `../screens/`, so a fork swaps `ProfileContainer.tsx` for its
own and the barrel, `App.tsx` and this registry are all untouched.

What a fork could not previously do is add a destination upstream has no route
for. `Route` is a closed discriminated union and the stack switch reads it, so a
new screen meant editing both — in the two places upstream edits most.

One variant carries all of them: `push({ name: 'overlay', screen: 'widgets' })`
looks its renderer up in `OVERLAY_SCREENS`. The union keeps its exhaustiveness,
`App.tsx` gains one case rather than one per fork screen, and the header title
comes from the registry so every fork screen is not titled "overlay".

An unknown key renders a visible notice (`overlay-screen-missing`), never a
blank body. A blank body is the failure this codebase keeps finding — a tab with
no feed behind it, a screen nothing mounts — and it looks exactly like a screen
that rendered and had nothing to say.

An overlay screen is a **pushed** screen, so it has no tab bar: `App` renders
that only at the root of the stack (005/J-21, which cost two device runs).

Nothing upstream pushes an overlay route — a fork's own screen does. `Shell`
takes an `initialStack` for that reason, which is also how a fork deep-links
into its own screen.

## What this does NOT relax

Testids are part of the contract with `.maestro/`: `verify-maestro-ids.mjs`
walks `apps/mobile/src` and checks every selector still resolves, so an overlay
screen's ids are covered like any other.

The guards in `../__tests__/` — touch targets, `text-has-colour`,
`no-hardcoded-style`, `no-shadow`, `images-are-described` — walk directories
rather than naming files, so they cover a fork's screens too.
