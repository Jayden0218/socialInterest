# Research: The App Says What It Is Doing

**Feature**: 012 | **Date**: 2026-09-16 | **Plan**: [plan.md](./plan.md)

---

## R1 — I LOOKED, AND THE SPEC'S CENTRAL MEASUREMENT WAS PARTLY WRONG

The spec was written from a grep. The first research task was to render the real screens
against a real API and look at them, because the request began "the UI is very bad" and
nobody had. Captures are in [`screens/`](./screens/), taken at 390x844 through the app's own
web build against a running API, signing up through the real screens.

**Two of the three claims hold. One does not.**

| Spec claim | Verdict |
|---|---|
| No loading state on the primary surfaces | **Holds.** Confirmed in the screen components |
| No pull-to-refresh anywhere | **Holds.** Zero occurrences in the whole app |
| "Explore and Activity have no empty state" | **WRONG.** Both have good ones |

Activity renders **"Nothing new / You are all caught up."** Profile renders **"No posts yet /
Your posts will appear here."** Inbox and Feed have them too.

**Why the measurement was wrong, because the mistake is reusable**: I grepped
`screens/*Container.tsx`. The containers fetch; the **screens render**. Empty states live in
`features/*/…Screen.tsx`, which the grep never opened. The tool reported truthfully about
the files it was given and the files were the wrong ones — the same shape as
`hooks-before-return.test.ts` reading a barrel and finding no offenders, recorded in
CLAUDE.md as "a guard can lose its subject and pass".

**FR-001 and SC-001 survive; the spec's framing of them does not.** The gap is loading and
refreshing, not emptiness.

---

## R2 — THE VISUAL DESIGN IS NOT THE PROBLEM

This is the finding that most changes the plan, and it contradicts the assumption the spec
recorded as load-bearing.

What the captures show: warm paper ground, white cards, one green accent, interest names as
coloured words, a two-column waterfall, five tabs with a raised compose control. **It is
coherent and it matches `design/007-ui`.** Nothing about the palette, spacing or type reads
as "very bad".

So the report was accurate and the diagnosis in the spec was aimed slightly wide. What a
person actually meets is below.

---

## R3 — EVERY IMAGE IS A BLANK GREY RECTANGLE, AND THERE IS NO STATE FOR THAT

The single most damaging thing in the feed capture. Six cards, six empty grey boxes, on a
product whose entire premise is photographs.

**Two causes, and they must not be conflated:**

1. **In this sandbox, object storage is genuinely unreachable** — MinIO publishes to quay.io,
   which the egress policy blocks (CLAUDE.md's dead-ends table). So the images *cannot* load
   here, and that part is an artefact of where the capture ran.
2. **But the app has no state for a picture that does not arrive.** No placeholder while it
   loads, no indication when it fails. It renders the same grey box either way — which is
   FR-001's four-state rule applied to an image rather than a screen, and nothing in the spec
   covered it.

(2) is a real product gap on any network, and is why a photo-sharing app on a slow
connection looks broken. **The spec must gain a requirement for it.**

Whether the owner's own Supabase-backed install also shows grey boxes is **not known from
here** and is the first thing to check on their device — if it does, that is 006/R4b's
media defect in a third place and a different, larger problem.

---

## R4 — EVERY POST SHOWS "♥ 0 · 0"

Every card in the capture carries zero reactions and zero comments. A feed of entirely
unengaged posts reads as abandoned however well it is laid out.

This is **not** a UI defect — it is what an install with no real use looks like, and no
state, skeleton or palette fixes it. It is the same fact US3 names: the cold-start problem
is the dominant impression the product gives, and it outranks everything else in this
feature by effect.

It also means **judging the visual design against this data is judging the data.** The
captures show test rows — captions like "Analogue 784701", authors called "discoverer" —
left by earlier test runs. The owner's install will look different and probably emptier.

---

## R5 — EXPLORE IS THE WEAKEST SCREEN, AND NOT FOR A REASON THE SPEC NAMED

The capture shows two search fields stacked above a flat list of twelve interest names, each
with a small coloured dot. No counts, no imagery, no sense of what is behind any of them.

It is not broken and it has no missing state. It is simply the least informative screen in
the product, on the tab a new person is most likely to press first when their feed means
nothing to them. **That is a US4 finding, not a US1 one** — and it is the one place where
"the UI is bad" is a fair description of something the states work cannot fix.

---

## R6 — PULL-TO-REFRESH: CONFIRMED ABSENT

Zero occurrences of `RefreshControl` or `onRefresh` in the entire mobile source. Unchanged
from the spec's claim, and the cheapest single improvement available: the gesture is
universal, its absence is silently confusing, and the feed already re-reads on demand.

---

## R7 — `people-search` IS UNREACHABLE, AND WORSE THAN THE SPEC SAID

It is a declared route with **no case in the renderer at all** — not merely nothing pushing
it. So a route that nothing can reach also could not render if reached. Two halves missing
rather than one.

`create-place` has a renderer and no caller, which is the ordinary version of the same thing.

---

## What this changes

- **US4 is no longer last by default.** Explore (R5) is a real visual problem and the
  states work will not touch it. Its priority is now a judgement for the plan, not an
  assumption.
- **A new requirement is needed for media states** (R3) — the four-state rule applied to an
  image, which the spec covered only for screens.
- **The spec's empty-state claims must be corrected** (R1), and its load-bearing assumption
  about aesthetics-versus-feedback re-stated now that somebody has looked.
- **US3 grows in importance** (R4). "♥ 0 · 0 everywhere" is the strongest negative signal in
  the captures and is a product problem, not a design one.
