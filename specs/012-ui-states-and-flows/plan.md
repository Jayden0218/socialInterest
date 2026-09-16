# Implementation Plan: The App Says What It Is Doing

**Branch**: `claude/pensive-goldberg-jjjni5` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-ui-states-and-flows/spec.md`

## Summary

Make the product look and behave like a product. Three problems, and they are not the same
kind of thing:

1. **It has no icons.** Five navigation destinations are an 8×8 dot; a reaction is `♥`. This
   is the largest single cause of "it looks like a prototype", it is objective rather than
   taste, and none of the state work touches it.
2. **It never says what it is doing.** No primary surface has a loading state and the app
   contains no pull-to-refresh at all, so "working", "empty" and "broken" are one blank
   rectangle.
3. **It waits to be driven.** Explore asks you to type before it shows anything; nothing
   prompts a newcomer; two routes cannot be reached at all.

The design is drawn and approved: [`design/012-ui/`](../../design/012-ui/), 24 artboards,
published as a canvas. **Implementation follows it; this plan does not reopen it.**

## Technical Context

**Language/Version**: TypeScript 5.7, React Native / Expo SDK 54

**Primary Dependencies**: `react-native-svg` for the icon set — **NOT present; it must be
installed, and the first version of this plan said otherwise.** Measured during
`/speckit-analyze`: zero occurrences in `pnpm-lock.yaml`, no directory under any
`node_modules`. It IS a known Expo native module (`expo/bundledNativeModules.json` pins
**15.12.1**), so it goes in with `expo install` and that file is the authoritative version
because `expo install` cannot reach its API from this sandbox. One new runtime dependency,
no icon font. Everything else is in the app already.

> The claim "already present" was never checked. It cost nothing here because the analysis
> pass caught it, but T008 as first written said to **stop and report** if the package did
> not resolve — so the false premise was pointed at the one phase that blocks every other
> visible change, and it would have halted there. Install it first (T003).

**Storage**: none. This feature writes nothing and reads no new data

**Testing**: jest + React Native Testing Library (mounting, props, source-scanning guards);
`apps/e2e/browser` rendering real screens in Chromium against a real API (layout, visibility);
Maestro on a device (**unavailable — see Risks**)

**Target Platform**: Android phone, 390×844 the reference viewport

**Performance Goals**: a skeleton must not appear for a request faster than ~200ms, and a
request pending past ~15s is reported failed rather than shown loading forever

**Constraints**: the visibility matrix and both route snapshots must come out unchanged; no
new visual language beyond what the artboards establish; no device verification available

**Scale/Scope**: 25 screens, 5 primary surfaces, 16 icons, 13 screens that did not exist as
artboards before this feature

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1.*

| Principle | Assessment |
|---|---|
| **I. Interest Is the Unit of Meaning** (NON-NEGOTIABLE) | **Engaged, and the redesign strengthens it.** The interest space — the surface the principle is *about* — had no artboard at all until this pass, on a product where "every space is browsed by one". The interest stays a coloured word and never becomes a chip, and `interest-treatment.test.ts` still forbids a place or a person carrying that treatment |
| **II. Visibility Is Decided Once** (NON-NEGOTIABLE) | **Not engaged, and that is the requirement.** This feature adds feedback and closes paths; it changes no permission. FR-022/FR-023 make it mechanical — the matrix and both snapshots must come out identical — and FR-011 keeps an empty state from explaining that the boundary caused it, which would make it an oracle |
| **III. Privacy Enforced Server-Side** | **Untouched.** No read path, no new request, no new field |
| **IV. Safety Ships With the Product** | **Improved.** Report and block currently sit behind an unlabelled `⋯`; the safety sheet gives them icons and names. A release gate is easier to reach, never harder |
| **V. Emulation Is Not Evidence** | **Engaged, and it is the main honesty risk.** RNTL performs no layout; react-native-web has no soft keyboard and ignores font scaling; a browser render says the UI and the service agree and nothing about a device. Every claim below is made at the tier that supports it, and the device tier is **not run** |

**Gate: PASS.** No violation to justify, so Complexity Tracking is omitted rather than filled
with "none".

**Re-checked after the design phase**: still PASS. 24 artboards added no surface, no route
that widens anything, and no field. The one thing that moved from assumed to decided is that
the icon set is hand-authored SVG paths rather than an icon font — see below.

## The decisions worth not re-litigating

### The icon set is hand-authored paths, not an icon library

`@expo/vector-icons` ships several thousand glyphs across a dozen families. This product
needs **sixteen**, and the artboards define them exactly — one 24px grid, 1.75 stroke, round
caps and joins.

Taking a library would mean shipping a font for sixteen glyphs, and — the part that matters
— **accepting whatever that family's stroke weight and corner treatment happen to be.** The
research finding was not "there are no icons", it was that the interface has nothing to be
consistent *with*; a borrowed family with a different stroke weight from the type is that
problem in a new form. Sixteen paths in one file is smaller, exact, and consistent by
construction.

**One `Icon` component, one paths map, one size scale** (13 counts, 20 actions, 23 nav).
Nothing may draw an icon any other way, and a guard enforces it.

### The four states come from the data hook, not from each screen

`usePaged` (`apps/mobile/src/containers/usePaged.ts`) already knows whether a request is in
flight, whether it failed, and whether the result is empty. So the state is **derived once**
and handed down, rather than each of twenty-five screens deciding for itself what "empty"
means.

**"Every list screen already calls it" is not true, and the exception is one of the five
surfaces this feature exists for.** Six hooks in `containers/index.ts` wrap it —
`useHomeFeed`, `useFollowingFeed`, `useInterestSearch`, `usePostSearch`, `useNotifications`,
`useProfilePosts` — which covers Feed, Explore, Activity and Profile. **Chats does not.**
`InboxContainer` hand-rolls `useState`/`useEffect`, and its `load` sets no loading flag at
all. So deriving in `usePaged` reaches four of the five, and Chats would get the
twenty-sixth hand-written state machine this decision exists to prevent. T017a moves it.

That is D6's argument about `VisibilityFilter` applied to a presentational fact: twenty-five
hand-written state machines is twenty-five chances to render a blank screen, and the five
that exist today already disagree with each other.

### A photograph is a surface too

FR-006a exists because the captures showed every image as the same grey box whether it was
loading, failed or absent. One `Photo` component wrapping `Image`, holding those three
states, used everywhere — so "a picture that did not arrive" has one answer rather than
twenty.

## Project Structure

```text
apps/mobile/src/
├── ui/
│   ├── Icon.tsx                # NEW — one component, 16 paths, three sizes
│   ├── icons.ts                # NEW — the path data, from design/012-ui/_icons.txt
│   ├── Photo.tsx               # NEW — an image with its own four states
│   ├── states.tsx              # NEW — Skeleton, EmptyState, FailedState
│   └── primitives.tsx          # gains nothing; the states live beside it
├── components/
│   └── PostCard.tsx            # rebuilt: image-dominant, avatar removed
├── features/*/…Screen.tsx      # the four states applied; icons replace dots and ♥
├── containers/
│   ├── usePaged.ts             # the four states derived HERE, once
│   └── index.ts                # the six hooks that wrap it — where refresh plumbs through
├── screens/*Container.tsx      # people-search given a way in; InboxContainer moved onto usePaged
└── App.tsx                     # the tab bar gains icons

apps/mobile/src/__tests__/
├── every-action-has-an-icon.test.ts   # NEW — the SC-009 guard
├── four-states.test.ts                # NEW — no surface can render blank
└── touch-target.test.tsx              # existing; the new controls register

apps/e2e/browser/
└── states.spec.ts              # NEW — the states are VISIBLE, which RNTL cannot say
```

**Structure Decision**: three new files in `ui/`, one rebuilt component, and edits across the
screens. No new module, no new route, no data-layer change beyond exposing refresh.

## Phasing

| Phase | What | Shippable alone? |
|---|---|---|
| **1** | The capture harness works and is repeatable | Yes — it is how every later phase is checked |
| **2** | The icon set: `Icon`, the paths, the three sizes, the guard | Yes, and it is the single biggest visible change |
| **3** | Icons applied everywhere — tab bar, actions, counts | Yes |
| **4** | The four states: `states.tsx`, derived from `usePaged`, on all five surfaces | Yes |
| **5** | Pull-to-refresh | Yes |
| **6** | `Photo` and its states (FR-006a) | Yes |
| **7** | The card rebuilt image-dominant | Yes |
| **8** | Reachability: `people-search`, `create-place`, the sheets | Yes |
| **9** | Explore shows before it asks; the newcomer prompt | Yes |
| **10** | Close-out: matrix and snapshots unchanged, the run recorded | — |

**Phase 2 before everything visual.** The states designed in Phase 4 use icons; building them
first would mean designing against a language about to change, which is the work-twice order
the spec's US6 was demoted to avoid.

## The three places the obvious implementation is wrong

1. **A skeleton that appears for a 40ms request is worse than no skeleton.** It is a flash of
   grey, and it reads as a glitch rather than as progress. The delay threshold is not polish.
2. **A "loading" state that never resolves is a blank screen wearing a costume.** Without an
   upper bound, a dropped connection shows a skeleton forever and the person waits on nothing.
3. **An empty list caused by a block must not say so.** The helpful message is the wrong one:
   Constitution II makes absence and refusal deliberately indistinguishable, and a considerate
   empty state here is an oracle.

## Risks

| Risk | Response |
|---|---|
| **No device verification is available.** No emulator in this sandbox, and nothing in 011 has run on a device either | Every claim is made at the tier that supports it and the device tier is reported **not run**. The browser capture is the best available and its limits are stated, not glossed |
| RNTL says a component mounted, not that it is visible | 008 shipped `MediaPager` collapsed to zero height with nine green assertions. Anything about visibility is asserted in the browser, never in RNTL |
| The icon guard is a source scan, so a computed name could hide from it | Same blind spot `verify-maestro-ids` has with a dynamic prefix. The guard asserts the `Icon` component is the only thing that draws one, which is the property that actually matters |
| A redesign quietly changes a permission | FR-022/FR-023: the matrix and both snapshots must come out identical, checked as a task, never updated to match |
| The design gets reopened mid-build | It was reopened once, deliberately, by the owner. It is settled again now: 24 artboards, published. Implementation follows it |
