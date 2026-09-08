# Feature 006 — UI redesign — verification record

**Date**: 2026-09-08
**Feature**: `specs/006-ui-redesign/` — dark green brand, design system, shared post card
**Commit under test (local suites)**: `610a529`
**Commit under test (device)**: `610a529` — run 37, **19/19**
**Cost**: zero. Everything ran on the `local` profile or on GitHub-hosted standard
runners, which are free on this public repository. No billable resource was
provisioned.

**Three device runs are recorded, not one.** Reporting only the green one would
delete both the reason this feature needed a device and the mistake that cost a
run — and the second is the more useful record.

| Run | Commit | Result | What it established |
|---|---|---|---|
| 35 | `a926a2d` | **18/19** | `09-report-and-block` failed on `block-person is visible`. A real defect: `Screen` was a plain `View`, so the safety sheet could not scroll and **Block this person was unreachable** on a short screen — Constitution IV failing silently. |
| 36 | `33d5365` | **1/19** | **My regression.** Having measured one screen, I set `scroll` on all eight that render a `Screen` without a list. `SignInScreen` became a `ScrollView`, sign-in stopped working, and every flow chaining `01-sign-in` failed. |
| 37 | `610a529` | **19/19** | Every flow on attempt 1, no device drop, no retry. |

**How run 36 was diagnosed, since "sign-in broke" was not the evidence.** The
whole-run API aggregate showed `GET /v1/me` 200 **three times** — all host-side
fixtures, none from the device — against 54 in run 35, and `GET /v1/feed/home`
**401 twenty times**: the app was signed out for the entire run. The end-of-run
screen dump still showed `sign-in-screen` with the token field holding content,
so the button was enabled and the tap simply did not take. Two ScrollView
mechanisms fit — `keyboardShouldPersistTaps` defaulting to `never` swallows the
tap that dismisses the keyboard, and a keyboard-resized viewport leaves the
button below the fold where a plain `View` would have moved it above. **Neither
is reproducible in a browser**, which has no soft keyboard, so seven screens were
REVERTED rather than fixed on an untestable theory, and `handled` was set because
it is correct under either.

## Every criterion, and what measured it

| Criterion | Command that measured it | Result |
|---|---|---|
| **SC-001** — every post surface shows media, author, interest, counts | `pnpm --filter @sih/mobile test` → `post-card.test.tsx`, and `PostCard` is the only row renderer on all five surfaces | **met** |
| **SC-002** — media reachable from every browse surface, *by rendering* | `apps/e2e/scripts/capture-screens.ts`; images visible in `docs/screens/03`, `06`, `07`, `10`, `18` | **met** — and it was NOT met before this feature; see R4b |
| **SC-003** — two interests distinguishable with titles removed | `interest-colour.test.ts` + `docs/screens/06-interest-space.png` (identity rule and chip in Birding's own hue) | **met** |
| **SC-004** — WCAG AA over every producible colour pair, both palettes, not sampled | `contrast.test.ts` — both palettes and all **720** generated interest colours | **met** |
| **SC-005** — every existing testID still resolves; `verify-maestro-ids` passes; 19 Maestro flows and all browser journeys pass | `testid-snapshot.test.ts`, `node scripts/verify-maestro-ids.mjs` (154 selectors across 19 flows), `pnpm --filter @sih/e2e test`, and **emulator run 37: 19/19** | **met** |
| **SC-006** — a list does not shift as media loads | `PostCard` reserves the box with `aspectRatio` before the image resolves; `post-card.test.tsx` | **met by construction, NOT measured as a position delta** — stated as such rather than claimed |
| **SC-007** — 44×44 minimum, checked mechanically | `touch-target.test.tsx` | **met** |
| **SC-008** — 20 screens recaptured, before/after reviewable in one place | `docs/screens/README.md` | **met** |
| **SC-009** — API, mobile and e2e pass with no change to behavioural assertions | full CI step list, below | **met** |

## The full CI step list, run rather than approximated

Every step from `.github/workflows/ci.yml`, in order, locally:

| Step | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm --filter @sih/api test` | **815** tests, 45 suites |
| `pnpm --filter @sih/mobile test` | **148** tests, 20 suites |
| `pnpm --filter @sih/workers test` | **6** tests |
| `node scripts/verify-maestro-ids.mjs` | 154 selectors, 19 flows, all resolve |
| `generate:client` + `git diff --exit-code` | no diff |
| `pnpm --filter @sih/e2e test` | **131** tests, 22 suites |
| `pnpm --filter @sih/api smoke:boot` | 9/9 routes under the production runner |
| `pnpm --filter @sih/e2e test:durability` | 4 tests |
| `verify:stack`, `synth`, `verify:register` | pass; **nothing deployed** |

`@sih/e2e` was run **alone**. Two concurrent jest invocations each kill the
other's API and produce a page of `fetch failed` that reads like a product
failure — that mistake cost a full debugging pass earlier in this feature.


## The device run — G5

**Run 37, 2026-09-08, `610a529`: 19/19, every flow on its first attempt**, no
device drop and no retry. Emulator booted in 61s; the journeys took 22m 33s.

Effects asserted through the SERVICE, not the view hierarchy — the whole-run API
aggregate for run 37:

| Effect | Evidence |
|---|---|
| Publishing | `POST /v1/media/uploads` 201 ×9, `POST /v1/posts` 201 ×9 |
| Signed-in browsing | `GET /v1/me` 200 ×24 (+304 ×33), `GET /v1/feed/home` 200 ×26 |
| **Reporting (Constitution IV)** | `POST /v1/reports` **201** |
| Commenting | `POST /v1/posts/:postId/comments` 201 |
| Saving | `PUT /v1/posts/:postId/save` 204, `GET /v1/me/saved` 200 |
| Places and reviews | `PUT /v1/places/:placeId/rating` 200 ×2 |
| Group chat | `POST /v1/conversations/groups` 201, `.../participants` 204, `.../leave` 204 |
| Preferences | `PATCH /v1/me` 200 |

**`POST /v1/reports` is the line that matters.** It is absent from run 35's
aggregate and from run 36's — the safety sheet's failure meant no report was ever
submitted on a device across either run. Its appearance here is what makes
`09-report-and-block` a pass rather than a flow that stopped failing.

The 20 `GET /v1/feed/home` 401s are the signed-out flow doing its job, not a
defect: they appear in every run including the green ones.

## What is NOT met, named rather than omitted

A record that lists only what passed is an advertisement. These are the things
006 did not settle, each with why.

| Not met | Why, and what would settle it |
|---|---|
| **001/SC-011 — a video PLAYING on a device** | `19-publish-video` uploads a real clip, transcodes it and asserts the POSTER FRAME renders (FR-009). It does not assert playback starts. Unchanged by 006 and still open. |
| **006/FR-017 — a working light mode** | Both palettes exist and both pass contrast over the whole generated space, so the requirement as written is met. A light mode that FOLLOWS THE PLATFORM is not: `useTheme()` returns `activePalette` and ignores `useColorScheme()`. Screens read the palette at module scope, and a style object built at import time cannot call a hook — following the platform needs every screen to build its styles inside the component, which is a change of shape, not of names. Half-doing it is what produced white cards in dark green chrome on the first `PostCard` capture. |
| **006/SC-006 — no list shift as media loads** | `PostCard` reserves the media box with `aspectRatio` before the image resolves, so a shift is not possible by construction. **That is an argument, not the measurement the criterion asks for** — a position delta before and after media becomes ready was never taken. Recorded as met-by-construction, not as measured. |
| **iOS** | Nothing has ever run. The Simulator is macOS-only and macOS runner minutes bill at ten times the rate. Unverified, not "probably fine". |
| **002/SC-002 — 10,000 concurrent** | Unmeasured. Only a provisioned-DynamoDB run can close it and the owner declined the spend. Report unverified, never as met. |
| **Real usage** | Nobody has used the product. Retention, second-post rate and onboarding success stay unanswered; a script exercising those paths measures the script. |
| **A public deployment** | Still none. DynamoDB Local is a dev tool; the datastore decision (`003/datastore-decision.md`) remains the owner's and is recorded pending. |

## Two guards that passed for the wrong reason

Both are recorded because catching them is the only reason the rest of this
record can be trusted.

- **`N-04` had never tested the guarantee it names.** It builds
  `${s3Endpoint}/${bucket}/${rendition}` while `rendition` is ALREADY A FULL
  URL — a URL nested inside a URL, which errors whatever the bucket permits. I
  first reported that opening the bucket "made private media readable and broke
  N-04"; the second half was wrong and I had not read the failure, which went
  404 → **400**, not to a successful fetch. Reverting the open bucket was still
  right, for a reason I had not given.
- **The `safety-fit` browser guard passed with the defect still in place.** Its
  first version used `scrollIntoViewIfNeeded`, and Playwright scrolls the
  DOCUMENT — a browser page scrolls where a React Native screen does not, so it
  answered a question the device never asks. It now walks the ancestors for a
  container the APP itself scrolls, verified red with the fix reverted and green
  with it restored.

## Notes

A pass is scoped to the commits named at the top. The local suites and the
device run are two different pieces of evidence on two different commits, and
neither is reported as covering the other.
