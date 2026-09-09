# 008 — the guard red log

**Purpose (008/T012)**: a guard nobody has watched fail is not yet a guard.

This project has shipped one that proved the point. 006's `safety-fit.spec.ts` passed with
the defect still in place, because `scrollIntoViewIfNeeded` scrolls the DOCUMENT and a React
Native screen scrolls somewhere else — a green result that meant nothing, on a Constitution IV
safety control. 007 added a second: `signin-fit.spec.ts` was written against an invented
constant, verified against one run's numbers, and passed through runs 40 and 41 while the
device failed identically each time.

So every structural guard in feature 008 is recorded here **only after it has been observed
failing**, with what was changed to make it fail and what the failure said. An entry is
evidence; a guard with no entry is an intention.

`008/T220` asserts this file has an entry for every structural guard in the feature.

---

## T010 — `apps/api/tests/unit/selection-not-boundary.spec.ts`

**Guards**: G4. `src/visibility/**` may not reach the mute or dismissal repositories, or the
ranker. Mute and dismissal are candidate SELECTION; the boundary decides visibility.

| | |
|---|---|
| **Observed red** | 2026-09-09, working tree at `687e56d` |
| **Change that broke it** | Added `import { MuteRepository } from '../persistence/mute.repository';` to `apps/api/src/visibility/visibility.filter.ts` |
| **What it said** | 4 offenders reported, each as `src/visibility/visibility.filter.ts:<line> → <identifier>` |
| **Reverted** | yes, immediately; suite green again |

The failure named the file, the line and the identifier rather than "expected [] to equal
[…]", which is the difference between a guard that reports a defect and one that reports a
disagreement.

**Note on scope**: `MuteRepository` does not exist yet. The guard is a dependency check and
fires on the *reference*, before any post exists that would demonstrate a leak — which is
exactly why it can be written before the code it governs and why the constitution requires
contract tests first. Its behavioural half (`mute-does-not-hide-profile.spec.ts`, T158) is
Phase D work and neither is sufficient alone.

---

## T011 — `apps/api/tests/unit/privacy-is-not-per-surface.spec.ts`

**Guards**: G5. No module outside `src/visibility/` reads `accountPrivacy` to decide what to
return. Account privacy is one clause in one boundary.

| | |
|---|---|
| **Observed red** | 2026-09-09, working tree at `687e56d` |
| **Change that broke it** | Added a hand-written `accountPrivacy === 'private'` predicate to `apps/api/src/modules/feed/feed.service.ts` |
| **What it said** | `src/modules/feed/feed.service.ts:77` |
| **Reverted** | yes, immediately; suite green again |

**The pair is the point.** T010 and T011 guard opposite sides of one question — *does this
rule change whether the viewer MAY see the post?* — and were verified red within minutes of
each other, against the same tree. Two rules that look alike, on opposite sides, each with a
guard that fires when the other's answer is used.

---

## T008 — `apps/e2e/journeys/response-shape.spec.ts` (declared-field guard)

**Guards**: FR-054. Every declared optional field in a response schema is non-null in at
least one fixture.

| | |
|---|---|
| **Observed red** | 2026-09-09, working tree at `687e56d`, **against the product as it stands** |
| **Change that broke it** | none — the defect is live |
| **What it said** | `{ field: 'Notification.readAt', populated: false }` |

This one did not need to be broken on purpose. `readAt` is declared on every notification,
returned to every client, and **written by nothing**, so the guard was red the first time it
ran. That is the whole finding of 008's Phase A in one assertion.

`PublicProfile.avatarUrl` is registered in the same table with `hasWriter: false` and is
**reported, not asserted**, because its writer is Phase B — asserting it now would leave the
suite red for every unrelated task until US5 lands, which is how a signal stops being read.
That ratchet is the same shape as `apps/api/tests/visibility/surfaces.ts`.

**What this guard cannot catch**, recorded here so the entry is not read as more coverage
than it is: a field the server populates correctly and a client ignores. That is 007's
`ApiPage<T>` defect — five features of green tests, because every mobile test stubbed the
data layer and the stubs were wrong in the same way the type was. Only a request finds it.

---

## Pending

| Guard | Task | Verified red by |
|---|---|---|
| `following-feed-is-unranked.spec.ts` | T037 | T048 |
| `one-profile-projection.spec.ts` | T071 | T072 |
| `search-records-no-signals.spec.ts` | T087 | T104 |
