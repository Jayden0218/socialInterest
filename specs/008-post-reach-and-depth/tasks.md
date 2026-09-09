---
description: "Task list for 008 — a complete app: reach, depth and control"
---

# Tasks: A complete app — reach, depth and control

**Input**: Design documents from `/specs/008-post-reach-and-depth/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Test tasks are included and are **not optional here**. The constitution mandates
test-first for anything that declares itself a contract ("tests that define a contract are
written first") and mandates a measuring task for every numeric success criterion
("success criteria are measured, not asserted"). Both obligations are visible in the task
list rather than left to good intentions.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an incomplete task — may run in parallel
- **[USn]**: the user story this task serves

## Path Conventions

Monorepo: `apps/api`, `apps/mobile`, `apps/workers`, `apps/e2e`, `packages/shared`,
`.maestro`, `specs/008-post-reach-and-depth`.

## Delivery shape

Five phases from the spec. **Phase A (US1–US3) is the MVP and ships alone.**

| Release phase | Stories | Task phases | Gate | Tasks |
|---|---|---|---|---|
| **A — promises already made** | US1, US2, US3 | 3–5 | Phase 6 (T054–T059) | T001–T059 |
| **B — reach** | US4, US5, US6 | 7–9 | Phase 10 (T106–T107) | T060–T107 |
| **C — depth** | US7–US11 | 11–15 | Phase 16 (T157) | T108–T157 |
| **D — control** | US12, US13, US14 | 17–19 | Phase 20 (T203) | T158–T203 |
| **E — keeping** | US15 | 21 | Phase 22 (T215–T226) | T204–T226 |

**Release D (task phases 17–20) must not be split.** Constitution IV forbids scheduling safety controls as polish,
and mute without appeals is half a control surface.

---

## Phase 1: Setup

**Purpose**: the environment and the records this feature will be judged against.

- [X] T001 Bring the local profile up and confirm it: `docker compose up -d`, then `pnpm --filter @sih/infra db:create-local`, `s3:create-local`, `seed:catalogue`. In this sandbox write `/etc/docker/daemon.json` with the `mirror.gcr.io` registry mirror and start dockerd with `setsid nohup` first — neither survives a container reset (see `quickstart.md`).
- [X] T002 Drop and reseed the local DynamoDB table before any paging work, and record the row counts in `specs/008-post-reach-and-depth/quickstart.md`. A shared table grown across runs produced two false "regressions" in 007; check the size before believing a bounded-page failure.
- [X] T003 [P] Run the real CI step list from `.github/workflows/ci.yml` end to end on the current head and record the baseline result in `docs/verification/runs/2026-09-09-008-baseline.md`. There is no `pnpm verify` aggregate — running a proxy for the list is how two red builds happened.
- [X] T004 [P] Add the 008 surface and item-type stubs to `specs/001-interest-media-sharing/contracts/openapi.yaml` as a tracked TODO block, so the contract and the code change in the same diff rather than after it (002's first defect).
- [X] T005 [P] Record in `docs/verification/divergence-register.md` that 008 introduces **no new divergence** — post search deliberately does not adopt a managed search service (research R6). `verify:register` checks this file; a single writer only.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the two guards this feature exists to install, and the matrix machinery every
later story adds a row to.

**⚠️ No user story work begins until this phase is complete.**

- [X] T006 Extend `apps/api/tests/visibility/matrix.spec.ts` so surfaces are declared in a registry with a `kind`, and adding a surface is a data change rather than a code change. **Already satisfied**: `apps/api/tests/visibility/surfaces.ts` is that registry, carries `kind`, and has an append-only `EVER_BUILT` ratchet. Verified, not rewritten. 005 added `Surface.kind` because otherwise a review surface would run post rows and report a bigger green number for a smaller thing.
- [X] T007 Extend `apps/api/tests/visibility/surface-routing.spec.ts` to fail when a surface appears in the matrix registry but no test proves it **consults** `VisibilityFilter`. **Already satisfied**: its completeness test fails for any `built` surface without a probe. Verified, not rewritten. A matrix row for a surface that never calls the boundary passes for the wrong reason.
- [X] T008 [P] Add the declared-field guard (FR-054) to `apps/e2e/journeys/response-shape.spec.ts`: every optional field declared in a response schema must be **non-null in at least one fixture**. Verify it RED against `readAt` and `avatarUrl` as they stand today (research R16).
- [X] T009 [P] Add a multi-item media fixture to `apps/mobile/src/__tests__/fixtures/` and make the post-rendering tests use it. Confirm the fixture has more than one item — a multi-item assertion against a single-item fixture passes and means nothing.
- [X] T010 [P] Write `apps/api/tests/unit/selection-not-boundary.spec.ts` per `contracts/selection-vs-boundary.md`: `apps/api/src/visibility/**` must not import a mute or dismissal repository, transitively. It has nothing to guard yet and MUST still be written now — it is a contract test.
- [X] T011 [P] Write `apps/api/tests/unit/privacy-is-not-per-surface.spec.ts`: no module outside `apps/api/src/visibility/` may read `accountPrivacy` to decide what to return. Comments are stripped line-by-line before scanning — 004 and 007 both had guards that a comment alone made pass.
- [X] T012 Add `docs/verification/008-guard-red-log.md` recording, for each structural guard in this feature, the commit at which it was **observed failing**. A guard nobody has watched fail is not yet a guard (006's `safety-fit.spec.ts` passed with the defect in place).

**Checkpoint**: the matrix takes new surfaces as data, and the two guards that govern Phase D
exist before the code they govern.

---

## Phase 3: User Story 1 — See the whole post (Priority: P1) 🎯 MVP

**Goal**: all ten photographs of a ten-photograph post are reachable. Nine of ten are
currently invisible to everyone, the author included, permanently.

**Independent test**: publish a post with ten images; count ten reachable items on the detail
surface, in publication order; browse surfaces show a count indicator and are not navigable
per item.

**No API change.** `PostQueryService.toResponse` already maps every media row, presigned, and
`keys.mediaItem`'s zero-padded `MEDIA#000` sort key already carries publication order
(research R1).

### Tests for User Story 1

- [X] T013 [P] [US1] Write `apps/e2e/journeys/media-set.spec.ts`: publish ten images over HTTP, assert the response carries ten ready items in publication order (SC-001). Verify it RED against the current mobile render, not against the API.
- [X] T014 [P] [US1] Write `apps/e2e/journeys/media-set-fixture.spec.ts` covering single-image, multi-image, video and partially-failed posts, asserting **zero unreachable published items** (SC-002).
- [X] T015 [P] [US1] Write `apps/mobile/src/__tests__/media-pager.test.tsx` asserting the pager renders every item and the position indicator, and renders **no indicator** for a single item (FR-002).

### Implementation for User Story 1

- [X] T016 [US1] Create `apps/mobile/src/components/MediaPager.tsx` — a horizontal pager over `post.media`, with `testID="media-pager"` and `testID="media-page-<index>"` per item. Every `Text` it renders must choose a colour explicitly; RN's `Text` inherits black and the redesign's ground is near-white.
- [X] T017 [US1] Add the position indicator to `MediaPager.tsx` (FR-002): shown only when `media.length > 1`. Give it a `hitSlop` if it is interactive rather than a `touchTarget` — 007 measured the interest word costing 43 points of layout for the same mistake.
- [X] T018 [US1] Replace the `media?.[0]` read in `apps/mobile/src/features/posts/PostDetailScreen.tsx:43` with `MediaPager` (FR-001).
- [X] T019 [P] [US1] Add a multi-item **count indicator** to `apps/mobile/src/components/PostCard.tsx` (both call sites, lines 67 and 264) — static, not a pager (FR-003). A swipeable card inside the waterfall fights the parent scroll, and 007/R6 recorded that nesting scrollables disables windowing.
- [X] T020 [P] [US1] Add the same count indicator to `PostTile` in `apps/mobile/src/components/PostCard.tsx`. **The task's premise was wrong**: `Waterfall.tsx:38` reads `media[0]` for the card's LAYOUT HEIGHT (its aspect ratio) and renders nothing — it delegates to `renderPost`. That read is correct and was left alone; the indicator belongs in the two components that draw a tile.
- [X] T021 [US1] Render failed media on the detail surface as an accounted-for slot, visible **only to the author** (FR-004), in `MediaPager.tsx`. The author already sees their own non-ready post; this is the per-item case of the same rule.
- [X] T022 [US1] Add `testID`s for every new control and run `node scripts/verify-maestro-ids.mjs` (FR-053). No spaces — a Maestro selector is a regex — and keep the literal prefix in the JSX, because the verifier reads the leading literal of a template in `testID=` position and cannot see through a helper call.
- [X] T023 [US1] Add `.maestro/23-multi-photo-post.yaml`: publish two images, open the post, swipe, assert the second item. Assert the effect **through the service** in the run aggregate (`POST /v1/posts` 201), not through the view hierarchy.

**Checkpoint**: US1 is independently shippable. `pnpm --filter @sih/e2e test -t "media set"` green, T013 and T014 previously observed red.

---

## Phase 4: User Story 2 — Notifications that can be read (Priority: P1)

**Goal**: give `readAt` a writer. It is declared, returned to every client, and written by
nothing, so every notification is unread forever.

**Independent test**: generate notifications, view them, `PUT` the read endpoint, and assert
`readAt` populated and `unreadCount` 0 from a **real response**; generate one more and assert
the count is exactly 1; a second account is unaffected.

### Tests for User Story 2

- [X] T024 [P] [US2] Write `apps/e2e/journeys/notification-read.spec.ts` over HTTP: read → mark → read again, `readAt` populated, `unreadCount` exactly 0 (SC-003). Assert against a real response — a stubbed data layer agreeing with a wrong type is how 007's `nextCursor` defect survived five features.
- [X] T025 [P] [US2] Write `apps/api/tests/integration/notification-read-isolation.spec.ts`: marking read on account A leaves account B's count untouched (FR-007).
- [X] T026 [P] [US2] Write `apps/api/tests/unit/notification-read-derivation.spec.ts` for the `readAt` derivation at the watermark boundary — a notification created exactly at `lastReadAt` is read, one a millisecond later is not.

### Implementation for User Story 2

- [X] T027 [US2] Add `notificationRead: (userId) => ({ pk: 'USER#<id>', sk: '#NOTIFREAD' })` to `apps/api/src/persistence/keys.ts`, beside `signalProfile`, with a comment stating it is the same watermark pattern `ConversationRepository.markRead` already uses.
- [X] T028 [US2] Add `readWatermark` read and write to `apps/api/src/persistence/notification.repository.ts` (A43).
- [X] T029 [US2] Add the bounded unread query (A44) to `apps/api/src/persistence/notification.repository.ts`: notifications with `sk > NOTIF#<lastReadAt>`. **Do not add a stored counter** — a count and the rows it counts are two sources of truth for one fact (research R2).
- [X] T030 [US2] Derive `readAt` in `apps/api/src/modules/notifications/notification.service.ts:190` from the watermark rather than passing through `n.readAt`, and add `unreadCount` to the list response.
- [X] T031 [US2] Add `PUT /v1/notifications/read` (FR-005, FR-006) to `apps/api/src/modules/notifications/notification.controller.ts`, idempotent, 204. **Path changed from the planned `/v1/me/notifications/read`** to sit beside `PUT /v1/conversations/:id/read`, the read watermark this copies; two watermark routes shaped differently would be one more thing to remember. All references updated. Confirm the controller's path resolves under the global `v1` prefix — `@Controller('v1')` under it gives `/v1/v1/...`, which is how every 007 signals route 404'd.
- [X] T032 [US2] Read the caller from `req.viewer`, not `req.user`. Passport's convention is not this app's, and that mistake turned the same 007 routes into 500s once the path was fixed.
- [X] T033 [US2] Update the public-route snapshot in `apps/api/tests/integration/auth-surface.spec.ts` deliberately, as a reviewed line. **No change needed and verified so**: the new route is authenticated, so the public set is unchanged and the test passes as-is — which is the guard confirming the decorator did not drift, not an omission. Inserting a method above an existing `@Get` moves the `@Public()` decorator onto the new method with typecheck and lint clean; this has happened twice here.
- [X] T034 [P] [US2] Add the endpoint to `specs/001-interest-media-sharing/contracts/openapi.yaml` in this same change.
- [X] T035 [US2] Call the read endpoint when the notifications screen is viewed, in `apps/mobile/src/screens/index.tsx`'s notifications container, and render the unread badge from `unreadCount`. Declare every hook **before** any return — a hook after the final return is dead code and one after an early return is "Rendered more hooks than during the previous render" (`__tests__/hooks-before-return.test.ts` fails the build for both).
- [X] T036 [US2] Add `.maestro/24-notifications-read.yaml` and assert `PUT /v1/notifications/read` **204** appears in the run's API aggregate.

**Checkpoint**: US2 independently shippable; `readAt` has a writer.

---

## Phase 5: User Story 3 — The feed of people you chose (Priority: P1)

**Goal**: make the Following tab real — chronological, unranked, signal-free. It currently
renders disabled and says so, which is honest but incomplete.

**Independent test**: a mixed fixture returns only followed authors' posts, strictly newest
first across a page boundary, and the viewer's signal profile is byte-identical before and
after browsing it.

### Tests for User Story 3

- [ ] T037 [P] [US3] Write `apps/api/tests/unit/following-feed-is-unranked.spec.ts` per `contracts/following-feed.md`: `following-feed.service.ts` must not import `SignalService`, `RankingService` or `CandidateSource`, transitively. Extract the check into a shared helper — T087 reuses it for search, and FR-009 and FR-021 are one requirement on two surfaces. Write it before the service exists.
- [ ] T038 [P] [US3] Write `apps/api/tests/integration/following-only-followed.spec.ts`: mixed fixture, zero unfollowed-author posts (SC-004).
- [ ] T039 [P] [US3] Write `apps/api/tests/integration/following-is-chronological.spec.ts`: strictly descending `createdAt`, **including across a page boundary**.
- [ ] T040 [P] [US3] Write `apps/api/tests/integration/following-records-no-signals.spec.ts`: read the signal profile, page through Following, read it again, assert unchanged (SC-005, FR-009).
- [ ] T041 [P] [US3] Write `apps/e2e/journeys/following.spec.ts`: page two actually loads over HTTP. 007 found five features' worth of lists that had never loaded a second page because every mobile test stubbed the data layer with the same wrong shape the type had.

### Implementation for User Story 3

- [ ] T042 [US3] Add `MAX_FOLLOWED_PEOPLE = 200` to `apps/api/src/modules/people/person-follow.service.ts`, enforced on follow, with the same message shape as `MAX_FOLLOWED_INTERESTS`. State in the comment that it is a **stated product constraint arriving from the fan-out bound** (research R3).
- [ ] T043 [US3] Create `apps/api/src/modules/feed/following-feed.service.ts` (FR-008): A9 for follows, A5 (`postByAuthor`, GSI2) per author, merge-sort by `createdAt` desc, then `VisibilityFilter` at read time (A45).
- [ ] T044 [US3] Implement the timestamp cursor in `apps/api/src/modules/feed/following-feed.service.ts`. **No stored cursor state and no materialised page** — 001/FR-017 and SC-009 require a visibility change to land immediately, and a stored page cannot guarantee it.
- [ ] T045 [US3] Add `GET /v1/feed/following` to `apps/api/src/modules/feed/feed.controller.ts`, using the existing nested `page.nextCursor` shape, not a top-level one.
- [ ] T046 [US3] Return `emptyStateHint` for a viewer following nobody, saying what the surface is **for** (FR-010). The value comes from the server, not the client — 006 recorded a test that invented its own hint values and failed for its own reason rather than the product's.
- [ ] T047 [US3] Register the Following feed as matrix surface 13 in `apps/api/tests/visibility/matrix.spec.ts`'s registry (T006) and add its assertion to `apps/api/tests/visibility/surface-routing.spec.ts` (T007).
- [ ] T048 [US3] Verify T037 RED by adding a real `RankingService` import, watching it fail, reverting, and recording the commit in `docs/verification/008-guard-red-log.md`.
- [ ] T049 [P] [US3] Add the endpoint to `specs/001-interest-media-sharing/contracts/openapi.yaml` and update the auth-surface snapshot.
- [ ] T050 [US3] Make the Following tab live in `apps/mobile/src/features/feed/HomeFeedScreen.tsx` — remove `disabled`, wire `accessibilityState.selected`, and delete the code comment saying it is not built. **Leaving that comment would be worse than leaving the control disabled**: 007 found a follow hint still describing a withdrawn requirement because only the code was changed and not the copy.
- [ ] T051 [US3] Add the Following container and its paging to `apps/mobile/src/screens/index.tsx`, reusing `usePaged`. Confirm it reads `page.nextCursor`.
- [ ] T052 [US3] Ensure the Following container in `apps/mobile/src/screens/index.tsx` does **not** attach the dwell/signals hook. FR-009 is a client obligation as well as a server one; the dwell hook is attached per screen.
- [ ] T053 [US3] Add `.maestro/25-following-feed.yaml` asserting `GET /v1/feed/following` **200** in the run aggregate. Do not chain a flow whose follow toggle has already fired — a toggle is not idempotent and flows share one server (005 lost a run to exactly this).

## Phase 6: Release gate — Phase A (US1–US3)

- [ ] T054 Run the real CI step list from `.github/workflows/ci.yml`, in order, and record it in `docs/verification/runs/2026-09-09-008-phase-a.md`.
- [ ] T055 Run `pnpm --filter @sih/api test:visibility` against `apps/api/tests/visibility/matrix.spec.ts` and confirm **zero skipped rows** with surface 13 present (SC-016).
- [ ] T056 Measure SC-017 for every control added in Phase A **in two places, because no single harness can measure both halves**. Screen size: `apps/e2e/browser/` at the shortest supported viewport. Font scaling: a device run, or an `apps/mobile` component test with an explicit scale factor — **react-native-web ignores the platform font setting**, which is exactly why the `Avatar` overflow was invisible to every browser journey and every screenshot in `docs/screens`. Where a control sits above its field that is an invariant needing no number; where it necessarily sits below one, bound it by what a device demonstrably reached (`ngmeasure.spec.ts`, 289) — **never by 640 minus a guess**.
- [ ] T057 Dispatch `.github/workflows/android-emulator.yml` for Phase A's flows and read the whole-run API aggregate, which prints last and to `$GITHUB_STEP_SUMMARY`. Job logs come back only as a tail and the artifact host is denied by this environment's egress with a 403.
- [ ] T058 Write `docs/verification/runs/2026-09-09-008-phase-a-device-record.md` with the per-flow result and the aggregate status codes. Report failures plainly; "it should work" is not a result.
- [ ] T059 Check every Phase A box in this file, then update `CLAUDE.md`'s 008 section. **Check the boxes before writing "complete"** — in 007 the task list was right and the summary was not, for four tasks and nine screens.

**Checkpoint — Phase A is a coherent release and may ship here.**

---

## Phase 7: User Story 4 — Send a post to anyone (Priority: P1)

**Goal**: a post travels to somebody you have never messaged. **The server is already
finished** (research R4): `PUT /v1/conversations/with/:handle` is idempotent over the derived
pair id, messages accept `sharedPostId`, and `MessagePresenter` already resolves the shared
post per reader through the boundary.

**Independent test**: send a post to a stranger; it arrives as a *request*; a send a block
forbids is refused without revealing the block, via the path a modified client would take.

### Tests for User Story 4

- [ ] T060 [P] [US4] Measure SC-006 in `apps/e2e/journeys/send-post-to-stranger.spec.ts`: assert the path is **no more than four interactions** and that every step is populated. Record an elapsed time on the device run as an **observation only** — never a pass condition. The criterion's original "under 30 seconds" is withdrawn in `spec.md` because a stopwatch on this stack times the emulator, not the product; the constitution still requires a numeric criterion to have a measuring task, and this is it.
- [ ] T061 [P] [US4] Write `apps/e2e/journeys/send-post-to-stranger.spec.ts`: send to somebody never messaged, assert a conversation **request** is created and the recipient can open the post (SC-006, FR-011, FR-012).
- [ ] T062 [P] [US4] Write `apps/api/tests/integration/send-post-recipient-cannot-see.spec.ts` driving the request **directly**, not through the app, over **both** cases SC-007 covers: a block (FR-014) **and** a followers-only post sent to a non-follower (FR-013). `MessagePresenter` already returns `not-for-you` with no content; nothing asserted the second case, and "may not see it" is broader than a block. Principle III — a test that drives only the first-party client does not verify a server-side guarantee.
- [ ] T063 [P] [US4] Write `apps/api/tests/integration/share-link-confers-nothing.spec.ts` re-asserting 001/FR-042 under the new send path (FR-016).

### Implementation for User Story 4

- [ ] T064 [US4] Create `apps/mobile/src/features/posts/SharePostSheet.tsx` — recipient picker over people search (A34) plus a "Share outside" row. Every `Text` chooses a colour; no `elevation` (the token is deleted, and a name that does not exist is a typecheck failure).
- [ ] T065 [US4] Wire the picker to `PUT /v1/conversations/with/{handle}` then `POST /v1/conversations/{id}/messages` with `sharedPostId`, in `apps/mobile/src/data/`. **Add no endpoint** — a second way to write a message would need its own access check, which is the two-predicates failure in a new place.
- [ ] T066 [US4] Add the system share exit (FR-015) in `apps/mobile/src/features/posts/SharePostSheet.tsx`, handing the post's existing share link to the platform share mechanism.
- [ ] T067 [US4] Surface the refusal from `ConversationAccess` as a neutral message that does not disclose a block (FR-013, FR-014).
- [ ] T068 [US4] Add `testID`s and run `verify-maestro-ids.mjs`; add `.maestro/26-send-post.yaml` asserting `PUT /v1/conversations/with/...` and `POST .../messages` **201** in the aggregate.
- [ ] T069 [US4] Confirm no new row is needed in the visibility matrix and record **why** in `contracts/visibility-matrix-delta.md`: the shared-post read path already exists and is already a matrix surface. A "no change needed" that is not written down reads later as an omission.

**Checkpoint**: US4 shippable, with no server change and that fact recorded.

---

## Phase 8: User Story 5 — A face on a profile (Priority: P1)

**Goal**: a profile picture that can be set, and that appears everywhere. Today `avatarKey`
has no writer, and `avatarUrl` is emitted on **one of seven** profile projections — as the
raw storage key, which returns 403 against a private bucket.

**Independent test**: set an avatar once; assert `avatarUrl` present **and fetchable (200,
not 403)** on all seven profile-bearing responses.

### Tests for User Story 5

- [ ] T070 [P] [US5] Write `apps/e2e/journeys/avatar-everywhere.spec.ts`: set an avatar, then assert a fetchable `avatarUrl` on post author, comment author, review author, conversation participant, notification actor, people search and own profile (SC-008). **Fetch the URL** — presence of a string is what the current code would pass.
- [ ] T071 [P] [US5] Write `apps/api/tests/unit/one-profile-projection.spec.ts`: no module outside `profile.projection.ts` constructs an object literal carrying both `handle` and `displayName`. Strip comments line-by-line before scanning.
- [ ] T072 [US5] Verify T071 RED: hand-build a `PublicProfile` literal in one service, watch `one-profile-projection.spec.ts` fail, revert, and record the commit in `docs/verification/008-guard-red-log.md`. Without this, T220 demands a log entry nobody was scheduled to produce.
- [ ] T073 [P] [US5] Write `apps/api/tests/integration/avatar-key-is-server-derived.spec.ts`: a client-supplied key in the patch body is ignored (002's second defect let a post point at another person's media).

### Implementation for User Story 5

- [ ] T074 [US5] Create `apps/api/src/modules/people/profile.projection.ts` with `toPublicProfile()`, presigning `avatarKey` through the same `presignedGetUrl` used by `toMediaItem` — **after** any visibility decision, never before (006/R4b).
- [ ] T075 [US5] Route `apps/api/src/modules/posts/post-query.service.ts` through the projection.
- [ ] T076 [P] [US5] Route `apps/api/src/modules/engagement/comment.service.ts` through the projection.
- [ ] T077 [P] [US5] Route `apps/api/src/modules/notifications/notification.service.ts` through the projection.
- [ ] T078 [P] [US5] Route `apps/api/src/modules/conversations/conversation.service.ts` through the projection.
- [ ] T079 [P] [US5] Route `apps/api/src/ratings/review-query.service.ts` through the projection.
- [ ] T080 [US5] Route `apps/api/src/modules/people/person.controller.ts` through the projection and **delete** `avatarUrl: p.avatarKey` at line 42 — the raw-key emission.
- [ ] T081 [US5] Route `apps/api/src/modules/people/me.controller.ts` through the projection; `GET /v1/me` currently returns no `avatarUrl` at all.
- [ ] T082 [US5] Accept `avatarUploadId` in `me.controller.ts`'s patch schema; resolve it against the server's own upload record and write `avatarKey` via `updateProfile` (FR-017). Removal is `avatarUploadId: null`.
- [ ] T083 [US5] Confirm the avatar upload passes the same stripping and processing path as any other image (FR-018) — `upload.service.ts:78` already maps kind `avatar` to `image`; assert it rather than assume it.
- [ ] T084 [US5] Confirm the derived-initial fallback still renders for a person with no avatar (FR-019) in `Avatar`, which lives in `apps/mobile/src/ui/primitives.tsx` — there is no `ui/Avatar.tsx` — including `allowFontScaling={false}` on that glyph — the one exception the Avatar guard permits, and the guard asserts it is still there so deleting it cannot make the build pass.
- [ ] T085 [US5] Add avatar set/remove to `apps/mobile/src/features/profile/EditProfileScreen.tsx`, using `expo install`-provisioned modules only. `pnpm add` took `expo-image-picker@57` against SDK 54 and killed the app at module registration; `node_modules/.../expo/bundledNativeModules.json` is authoritative when the Expo API is unreachable from here.
- [ ] T086 [US5] Add `.maestro/27-set-avatar.yaml` asserting `PATCH /v1/me` **200** and a subsequent profile fetch carrying a fetchable avatar URL.

**Checkpoint**: US5 shippable; one projection, seven call sites, a fetchable URL.

---

## Phase 9: User Story 6 — Find a post, not just an interest (Priority: P2)

**Goal**: post text is searchable, and a search moves no ranking weight.

**Independent test**: a distinctive caption word finds the post; a viewer who may not see it
finds nothing; the signal profile is unchanged.

### Tests for User Story 6

- [ ] T087 [P] [US6] Write `apps/api/tests/unit/search-records-no-signals.spec.ts` (structural): the search module must not import `SignalService` or `RankingService` (FR-021). Share one helper with T037 — FR-009 and FR-021 are the same requirement on two surfaces, and two copies of the check are two things that can drift.
- [ ] T088 [P] [US6] Write `apps/api/tests/integration/post-search-visibility.spec.ts`: a restricted post is findable by its author and unfindable by everyone else (SC-009).
- [ ] T089 [P] [US6] Write `apps/api/tests/unit/tokeniser.spec.ts` pinning case folding, punctuation splitting, the stop-word list and the 40-term cap.
- [ ] T090 [P] [US6] Write `apps/api/tests/integration/search-index-follows-edits.spec.ts`: edit a caption, then assert the post is **no longer findable by a removed word** and **is findable by a new one**; and flip visibility, then assert the term rows agree with the post. A stale index is wrong in a way nothing else in the suite would notice.
- [ ] T091 [P] [US6] Write `apps/e2e/journeys/post-search.spec.ts`: publish, search a distinctive word, get the post; search a word in no post, get the interests-and-people fallback in the **same** response (FR-022).

### Implementation for User Story 6

- [ ] T092 [US6] Add `postTerm: (token, createdAt, postId)` to `apps/api/src/persistence/keys.ts` with a comment stating it is a **candidate index like `postInterestIndex`**, never consulted to decide (A46). The row denormalises `visibility` and `processingState` exactly as the interest index does, so the filter runs on Query results without a second read per candidate.
- [ ] T093 [US6] Create `apps/api/src/modules/search/tokeniser.ts` with the stop-word list and `MAX_TERMS_PER_POST = 40` as named constants, documented as starting values rather than measured optima.
- [ ] T094 [US6] Write term rows inside `apps/api/src/modules/posts/post.transaction.ts`'s existing `TransactWriteItems`. **Re-check the 100-item ceiling**: `PostTransaction` documents a comfortable margin today and 40 term rows narrows it to merely sufficient (005/R3 — the cap is a correctness constraint, not a preference).
- [ ] T095 [US6] Rewrite term rows on a caption edit in `apps/api/src/modules/posts/post-update.transaction.ts`: add rows for new tokens, delete rows for removed ones, in the same transaction as the caption write. Captions are editable via `PATCH /v1/posts/:postId`; without this a post stays findable by a word its caption no longer contains.
- [ ] T096 [US6] Join term rows to the **visibility fan-out** in `apps/api/src/modules/posts/post-update.transaction.ts`, alongside the interest and place index items. That file's own comment says an index item whose `visibility` drifts from the post's *"is exactly the SC-009 failure this class exists to make impossible"* — a term row is one more index item and gets the same treatment, not a copy of the pattern without the upkeep.
- [ ] T097 [US6] Delete term rows with the post, in the same transaction, in `apps/api/src/modules/posts/post-update.transaction.ts`'s `softDelete`.
- [ ] T098 [US6] Create `apps/api/src/modules/search/post-search.service.ts` (FR-020): query each term partition (A46), intersect by `postId`, order by recency, then `VisibilityFilter` (A47).
- [ ] T099 [US6] Add `GET /v1/search/posts` in `apps/api/src/modules/search/search.controller.ts`, returning the interests-and-people fallback on an empty result (FR-022).
- [ ] T100 [US6] Register post search as matrix surface 14 in `apps/api/tests/visibility/matrix.spec.ts` and add its assertion to `apps/api/tests/visibility/surface-routing.spec.ts`.
- [ ] T101 [P] [US6] Add the endpoint to `specs/001-interest-media-sharing/contracts/openapi.yaml` and update the snapshot in `apps/api/tests/integration/auth-surface.spec.ts`.
- [ ] T102 [US6] Add the post-search surface to `apps/mobile/src/features/discover/`, reusing `usePaged` and the nested cursor shape.
- [ ] T103 [US6] Confirm interest and people search remain reachable and complete via `apps/api/src/modules/interests/interest.controller.ts` and `apps/api/src/modules/people/person.controller.ts` (Constitution I, G1) — post search is an **additional** surface, never a replacement.
- [ ] T104 [US6] Verify T087 RED: add a real `SignalService` import to the search module, watch the guard fail, revert, and record the commit in `docs/verification/008-guard-red-log.md`.
- [ ] T105 [US6] Add `testID`s, run `verify-maestro-ids.mjs`, and add `.maestro/28-post-search.yaml` asserting `GET /v1/search/posts` **200**.

## Phase 10: Release gate — Phase B (US4–US6)

- [ ] T106 Run the real CI step list, the visibility matrix with surfaces 13–14 and zero skipped rows, and SC-017 for Phase B's controls; record in `docs/verification/runs/2026-09-09-008-phase-b.md`.
- [ ] T107 Dispatch `.github/workflows/android-emulator.yml` for Phase B's flows, read the aggregate, write the run record, and check every Phase B box in this file.

**Checkpoint — Phase B may ship.**

---

## Phase 11: User Story 7 — Reply to a comment (Priority: P2)

**Goal**: replies display with their parent. Nesting is bounded at one level for **display**;
the stored graph stays truthful (research R7).

**Independent test**: a fixture with a reply-to-a-reply (attaching to the deepest permitted
ancestor) and a moderated parent whose replies stay readable.

### Tests for User Story 7

- [ ] T108 [P] [US7] Write `apps/api/tests/integration/comment-replies.spec.ts`: replies grouped with their parent in 100% of cases, including a reply-to-a-reply (FR-025) and a moderated parent (FR-026), SC-010.
- [ ] T109 [P] [US7] Write `apps/api/tests/unit/reply-parent-validation.spec.ts`: a `parentCommentId` naming a comment on a **different** post is refused.
- [ ] T110 [P] [US7] Write `apps/api/tests/integration/moderation-does-not-cascade.spec.ts`: removing a parent leaves its replies readable, with the removal stated.

### Implementation for User Story 7

- [ ] T111 [US7] Add `parentCommentId` (FR-023) and `moderationState` to the comment item in `apps/api/src/persistence/comment.repository.ts`. **Do not change the sort key** — listing comments stays one Query (A48 reuses A15).
- [ ] T112 [US7] Validate the parent is a comment on the same post, in `apps/api/src/modules/engagement/comment.service.ts`.
- [ ] T113 [US7] Implement FR-025's attach-to-deepest-permitted-ancestor rule in `apps/api/src/modules/engagement/comment.service.ts`, so a deeper reply is re-parented rather than refused.
- [ ] T114 [US7] Group replies with their parent in the list response in `apps/api/src/modules/engagement/comment.service.ts`, ordering parent-then-replies-by-time (FR-024).
- [ ] T115 [US7] Make moderation of a comment **not** cascade to its replies (FR-026) in `apps/api/src/modules/moderation/moderation.controller.ts` and the removal path it calls — there is no `moderation.service.ts`; the parent renders as removed.
- [ ] T116 [P] [US7] Add `parentCommentId` and `moderationState` to `packages/shared/src/types/entities.ts`'s `commentSchema`, and to the OpenAPI contract.
- [ ] T117 [US7] Register the replies read path as matrix surface 15 in `apps/api/tests/visibility/matrix.spec.ts` and add its assertion to `apps/api/tests/visibility/surface-routing.spec.ts`.
- [ ] T118 [US7] Add the reply affordance and the nested rendering to `apps/mobile/src/features/engagement/`. The composer may sit below the field here — it rides under a `flex: 1` list that absorbs the keyboard resize, which is why the comment composer passed runs 34 and 37 while sign-in did not.
- [ ] T119 [US7] Add `testID`s, run `verify-maestro-ids.mjs`, and add `.maestro/29-reply-to-comment.yaml` asserting `POST /v1/posts/{id}/comments` **201** with a parent.

---

## Phase 12: User Story 8 — Correct or withdraw what you said (Priority: P2)

**Goal**: edit and delete your own comment; counts follow; somebody else's is refused
server-side.

**Independent test**: edit shows as edited; delete decrements the count; a direct request
with another person's `commentId` is refused.

### Tests for User Story 8

- [ ] T120 [P] [US8] Write `apps/api/tests/integration/comment-edit-delete.spec.ts`: edit sets `editedAt`; delete decrements `commentCount` and the count matches the rows (FR-027, FR-028).
- [ ] T121 [P] [US8] Write `apps/api/tests/integration/comment-authorisation.spec.ts` driving the request **directly** with another person's comment id (FR-029, Principle III).

### Implementation for User Story 8

- [ ] T122 [US8] Add `editedAt` and `deletedAt` to the comment item. FR-027's "marked as edited" **is** the presence of `editedAt` — not a separate flag that could disagree with it.
- [ ] T123 [US8] Create `apps/api/src/modules/engagement/comment-update.transaction.ts` writing the soft delete and the `commentCount` decrement in one `TransactWriteItems`. The existing "atomic add" on counts is a read-modify-write and says so in its own repository comment; 005/R5 made the rating aggregate transactional for exactly this reason.
- [ ] T124 [US8] Add `PATCH` and `DELETE` for a comment to `apps/api/src/modules/engagement/engagement.controller.ts` — the comment endpoints live there; there is no `comment.controller.ts` — refusing anyone but the author.
- [ ] T125 [P] [US8] Add both to `specs/001-interest-media-sharing/contracts/openapi.yaml` and update the snapshot in `apps/api/tests/integration/auth-surface.spec.ts`.
- [ ] T126 [US8] Add edit and delete affordances to `apps/mobile/src/features/engagement/`, shown only on your own comment.
- [ ] T127 [US8] Add `testID`s, run `verify-maestro-ids.mjs`, and add `.maestro/30-edit-delete-comment.yaml` asserting `PATCH` **200** and `DELETE` **204**.

---

## Phase 13: User Story 9 — Mention a person (Priority: P2)

**Goal**: `@handle` in a caption or comment resolves to a profile and notifies, subject to
preferences and to blocks.

**Independent test**: a mention notifies; a mention across a block notifies nobody and
discloses nothing; an unknown handle renders as plain text.

### Tests for User Story 9

- [ ] T128 [P] [US9] Write `apps/api/tests/unit/mention-resolution.spec.ts`: resolution happens at **write** time and an unknown handle yields no mention (FR-033).
- [ ] T129 [P] [US9] Write `apps/api/tests/integration/mention-across-block.spec.ts`: no notification and no disclosure in either direction (FR-032).
- [ ] T130 [P] [US9] Write `apps/api/tests/unit/mention-kind-has-both-halves.spec.ts`: `mention` appears in the notification-kind schema, in `describeNotification`, in the preferences list **and** in the list the Edit-profile screen renders. 004's `message` toggle existed in the describing list and not the rendering one; 007's `follow` kind had a toggle and no publisher.

### Implementation for User Story 9

- [ ] T131 [US9] Create `apps/api/src/modules/engagement/mention.ts` (FR-030): parse `@handle`, resolve to userIds at write time, return the resolved list. Re-parsing at read time would let a handle change silently re-point an old mention (research R9).
- [ ] T132 [US9] Store `mentions: string[]` on the post and comment items, in `apps/api/src/persistence/post.repository.ts` and `apps/api/src/persistence/comment.repository.ts`. **Add no index** — a "posts mentioning me" surface is not a requirement, and adding the write before the surface is how unused writes accumulate.
- [ ] T133 [US9] Add the `mention` notification kind and publish it, passing the same block check via `decideAuthoredRules` rather than asking the question again (FR-031, FR-032).
- [ ] T134 [P] [US9] Add `mention` to `notificationPreferencesSchema` in `packages/shared/src/types/entities.ts` **and** to the categories list `EditProfileScreen` renders — both lists, or neither.
- [ ] T135 [P] [US9] Add `mentions` to `postSchema` and `commentSchema` and to the OpenAPI contract.
- [ ] T136 [US9] Render mentions as links to the profile in `apps/mobile/src/components/PostCard.tsx` and the comment list, from the **stored** list; an unresolved handle stays plain text.
- [ ] T137 [US9] Add the mention autocomplete over people search to the caption composer in `apps/mobile/src/features/publish/` and the comment composer in `apps/mobile/src/features/engagement/`.
- [ ] T138 [US9] Add `testID`s, run `verify-maestro-ids.mjs`, and add `.maestro/31-mention.yaml` asserting the mention notification arrives via `GET /v1/notifications` **200**.

---

## Phase 14: User Story 10 — Say what is in the picture (Priority: P2)

**Goal**: every image carries a description or an announced fallback.

**Independent test**: a per-tag guard over every `Image` render; 100% carry a label from one
source or the other (SC-011).

### Tests for User Story 10

- [ ] T139 [P] [US10] Write `apps/mobile/src/__tests__/images-are-described.test.ts` enumerating **every `Image` tag**, not every file. A per-file check lets one labelled image approve the rest of the file — exactly how the touch-target guard passed over a 36.7pt target.
- [ ] T140 [P] [US10] Write `apps/api/tests/integration/alt-text-roundtrip.spec.ts`: set at publish, returned on read, editable with the post (FR-034, FR-036).

### Implementation for User Story 10

- [ ] T141 [US10] Add `altText` (≤300) to the media item record and to `mediaItemSchema` in `packages/shared/src/types/entities.ts` — on the **media item**, not the post, because a post has up to ten.
- [ ] T142 [US10] Accept `altText` per upload in `apps/api/src/modules/posts/post.controller.ts` and persist it in `post.transaction.ts`.
- [ ] T143 [US10] Allow editing it in `post-update.transaction.ts` wherever the post is editable (FR-036).
- [ ] T144 [P] [US10] Add `altText` to `specs/001-interest-media-sharing/contracts/openapi.yaml`.
- [ ] T145 [US10] Add the per-image description field to the publish flow in `apps/mobile/src/features/publish/`.
- [ ] T146 [US10] Apply `accessibilityLabel` from `altText`, with a fallback naming the post's interest and author rather than the word "image" (FR-035), in `MediaPager`, `PostCard`, `Waterfall` and `Avatar`.

---

## Phase 15: User Story 11 — Finish it later (Priority: P3)

**Goal**: an unfinished post is kept as a draft, private to its author.

**Independent test**: save with media, caption, interest and place; reopen; zero fields lost
(SC-012).

### Tests for User Story 11

- [ ] T147 [P] [US11] Write `apps/e2e/journeys/draft-roundtrip.spec.ts`: save and restore with zero fields lost, within the upload lifetime (SC-012).
- [ ] T148 [P] [US11] Write `apps/api/tests/integration/draft-is-private.spec.ts` driving the request **directly** with another person's draft id (FR-038, SC-015).
- [ ] T149 [P] [US11] Write `apps/api/tests/integration/draft-expired-uploads.spec.ts`: a draft older than its uploads' expiry restores caption, interest and place and **says so** about the media, rather than appearing to have silently lost data.

### Implementation for User Story 11

- [ ] T150 [US11] Add `draft: (userId, draftId)` to `keys.ts` — private by key, in the owner's partition with no index (the `savedPost` argument, A49).
- [ ] T151 [US11] Create `apps/api/src/persistence/draft.repository.ts` (FR-037) holding caption, `interestIds`, `placeId` and **`uploadIds`** — upload targets, not media rows, so a draft is a pre-publish object and publishing uses the existing path unchanged (research R11).
- [ ] T152 [US11] Add `POST`/`GET`/`DELETE` `/v1/me/drafts` in `apps/api/src/modules/posts/draft.controller.ts`.
- [ ] T153 [US11] Delete the draft **inside** `apps/api/src/modules/posts/post.transaction.ts`'s publish transaction, so FR-038's "stops being a draft" cannot half-happen.
- [ ] T154 [P] [US11] Add the endpoints to `specs/001-interest-media-sharing/contracts/openapi.yaml` and update the snapshot in `apps/api/tests/integration/auth-surface.spec.ts`.
- [ ] T155 [US11] Add draft save and restore to `apps/mobile/src/features/publish/`, including the expired-media message from T149.
- [ ] T156 [US11] Add `testID`s, run `verify-maestro-ids.mjs`, and add `.maestro/32-draft.yaml` asserting `POST /v1/me/drafts` **201** and a restore.

## Phase 16: Release gate — Phase C (US7–US11)

- [ ] T157 Run the real CI step list, the visibility matrix with surface 15 and zero skipped rows, SC-011 and SC-017; dispatch the emulator workflow; write `docs/verification/runs/2026-09-09-008-phase-c.md`; check every Phase C box.

**Checkpoint — Phase C may ship.**

---

## Phase 17: User Story 12 — Less of this, without blocking (Priority: P2)

**Goal**: mute a person, dismiss a post. **Both are candidate selection, never the
boundary** — `contracts/selection-vs-boundary.md`.

**Independent test**: a muted person's posts are absent from feed, Following and search, and
**present** on their profile and via `GET /v1/posts/{id}`, with the follow and any
conversation intact.

### Tests for User Story 12

- [ ] T158 [P] [US12] Write `apps/api/tests/integration/mute-does-not-hide-profile.spec.ts` — the load-bearing test. Absent from feed/Following/search, **present** on the profile and the direct read (SC-013).
- [ ] T159 [P] [US12] Write `apps/api/tests/integration/mute-is-invisible.spec.ts`: no count, ordering or aggregate visible to the subject changes (FR-040, Principle III).
- [ ] T160 [P] [US12] Write `apps/api/tests/integration/dismissal-is-negative-signal.spec.ts`: dismissing moves the signal profile in the negative direction (FR-042).
- [ ] T161 [P] [US12] Write `apps/api/tests/integration/dismissal-in-disclosure.spec.ts`: `dismiss` appears in 007's signals disclosure and is cleared by its reset. A collected signal absent from the disclosure is a Principle III violation, not a gap.

### Implementation for User Story 12

- [ ] T162 [US12] Add `mute: (muterId, mutedId)` to `keys.ts` — **no inverted index**, which is the mechanism of FR-040 rather than a rule someone must remember (A50).
- [ ] T163 [US12] Add `dismissal: (viewerId, postId)` to `keys.ts` (A51).
- [ ] T164 [P] [US12] Create `apps/api/src/persistence/mute.repository.ts`.
- [ ] T165 [P] [US12] Create `apps/api/src/persistence/dismissal.repository.ts`.
- [ ] T166 [US12] Apply mute (FR-039) and dismissal (FR-041) in `apps/api/src/modules/ranking/candidate-source.ts` — selection only.
- [ ] T167 [US12] Apply them in `apps/api/src/modules/feed/following-feed.service.ts` and in `post-search.service.ts`, at the same selection stage.
- [ ] T168 [US12] Add `dismiss` to `SIGNAL_WEIGHTS` in `apps/api/src/modules/ranking/constants.ts` with a negative weight, documented as a starting value.
- [ ] T169 [US12] Add `PUT`/`DELETE /v1/people/{handle}/mute` and `PUT /v1/posts/{postId}/dismiss`. No response anywhere may disclose a mute.
- [ ] T170 [US12] Add `dismiss` to the signals disclosure and reset in `apps/api/src/modules/signals/`.
- [ ] T171 [US12] **Verify T010 RED**: wire mute into `VisibilityFilter`, watch `selection-not-boundary.spec.ts` and `mute-does-not-hide-profile.spec.ts` both fail, revert, and record the commit in `docs/verification/008-guard-red-log.md`.
- [ ] T172 [P] [US12] Add the endpoints to `specs/001-interest-media-sharing/contracts/openapi.yaml` and update the snapshot in `apps/api/tests/integration/auth-surface.spec.ts`.
- [ ] T173 [US12] Add mute and dismiss to the safety sheet in `apps/mobile/src/features/safety/`. The sheet's `Screen` must stay scrollable — 006 found `block-person` **unreachable**, not merely below the fold, and that is a Constitution IV release gate.
- [ ] T174 [US12] Add `testID`s, run `verify-maestro-ids.mjs`, and add `.maestro/33-mute-and-dismiss.yaml` asserting `PUT /v1/people/{handle}/mute` **204**.

---

## Phase 18: User Story 13 — An account only your followers see (Priority: P2)

**Goal**: a private account, expressed as **one** candidate field and **one** clause in the
boundary — never a per-surface check.

**Independent test**: the generated matrix, zero skipped rows, including the new
`pending-follower` relationship, on every enumerated surface (SC-014).

### Tests for User Story 13

- [ ] T175 [P] [US13] Extend `apps/api/tests/visibility/matrix.spec.ts` with the `authorPrivacy` axis and the `pending-follower` relationship per `contracts/visibility-matrix-delta.md` §1–2. Write it before the clause exists — it is a contract test.
- [ ] T176 [P] [US13] Write `apps/api/tests/integration/privacy-flip-is-immediate.spec.ts`: flipping privacy changes every surface on the next read, with no re-index step (FR-044, 001/FR-017).
- [ ] T177 [P] [US13] Write `apps/api/tests/integration/existing-followers-keep-access.spec.ts` (FR-045).
- [ ] T178 [P] [US13] Write `apps/api/tests/integration/saved-post-of-newly-private-author.spec.ts`: a post saved before its author went private stops being readable (matrix surface 17).

### Implementation for User Story 13

- [ ] T179 [US13] Add `accountPrivacy: 'open' | 'private'` to the person item, defaulting to `open`.
- [ ] T180 [US13] Add `state: 'accepted' | 'pending'` to the person-follow row in `apps/api/src/persistence/person-follow.repository.ts`, **absent meaning accepted**, so every follow written before 008 keeps working — the same compatibility rule 005/FR-026 used for conversation state. State lives on the follow row, not on the person (005/R2).
- [ ] T181 [US13] Add `authorPrivacy` to `VisibilityCandidate` in `apps/api/src/visibility/visibility.filter.ts`.
- [ ] T182 [US13] Add the single clause to `decide()`: when the author is private, a `public` post is evaluated by the `followers` rule. **Change nothing else in the filter and nothing at all in any surface.**
- [ ] T183 [US13] Make only an `accepted` follow satisfy the `followers` case, in the same clause. A pending request grants nothing.
- [ ] T184 [US13] Populate `authorPrivacy` in every `toCandidate` construction, and confirm by grep that there is exactly one per module.
- [ ] T185 [US13] Add `accountPrivacy` to `PATCH /v1/me`.
- [ ] T186 [US13] Add follow-request endpoints — `GET /v1/me/follow-requests`, approve, decline — to `apps/api/src/modules/people/person.controller.ts` (A52, FR-043).
- [ ] T187 [US13] **Verify T011 RED**: add a hand-written `accountPrivacy` check to one surface, watch `privacy-is-not-per-surface.spec.ts` fail, revert, and record the commit.
- [ ] T188 [P] [US13] Add the endpoints and the field to `specs/001-interest-media-sharing/contracts/openapi.yaml` and update the snapshot in `apps/api/tests/integration/auth-surface.spec.ts`.
- [ ] T189 [US13] Add the privacy toggle and the follow-request list to `apps/mobile/src/features/profile/`.
- [ ] T190 [US13] Add `testID`s, run `verify-maestro-ids.mjs`, and add `.maestro/34-private-account.yaml` asserting `PATCH /v1/me` **200** and a follow request approved **204**.

---

## Phase 19: User Story 14 — Disagree with a moderation decision (Priority: P3)

**Goal**: an author is told what was removed and why, and can appeal.

**Independent test**: an appeal is readable by its author and moderators only, via the path a
modified client would take; the outcome is appended to the moderation log.

### Tests for User Story 14

- [ ] T191 [P] [US14] Write `apps/api/tests/integration/appeal-privacy.spec.ts` driving the request **directly** with another person's appeal id (FR-048, SC-015).
- [ ] T192 [P] [US14] Write `apps/api/tests/integration/appeal-outcome-is-logged.spec.ts`: the outcome appears in `MODLOG#` and survives deletion of the subject (Constitution IV).

### Implementation for User Story 14

- [ ] T193 [US14] Add `appeal` and `appealByState` keys to `keys.ts`, mirroring `report` and `reportByState` exactly, so the queue is one Query and a transition moves it with one write (A53).
- [ ] T194 [US14] Add the `APPEALBY#` pointer row to `apps/api/src/persistence/keys.ts` so an author's appeal list needs no scan (A54).
- [ ] T195 [P] [US14] Create `apps/api/src/persistence/appeal.repository.ts`.
- [ ] T196 [US14] Create `apps/api/src/modules/moderation/appeal.service.ts`, appending every outcome to the existing moderation log.
- [ ] T197 [US14] Add `GET /v1/me/moderation-notices` to `apps/api/src/modules/moderation/appeal.controller.ts` (FR-046) — an author is told **what** and **why**.
- [ ] T198 [US14] Add `POST /v1/appeals` and `GET /v1/me/appeals` to `apps/api/src/modules/moderation/appeal.controller.ts` (FR-047).
- [ ] T199 [US14] Add `GET`/`PATCH /v1/moderation/appeals` for operators, and confirm the operator guard by the boot-time route dump rather than by inspection.
- [ ] T200 [P] [US14] Add the endpoints to `specs/001-interest-media-sharing/contracts/openapi.yaml` and update the snapshot in `apps/api/tests/integration/auth-surface.spec.ts`.
- [ ] T201 [US14] Add the notice and appeal surfaces to `apps/mobile/src/features/safety/`.
- [ ] T202 [US14] Add `testID`s, run `verify-maestro-ids.mjs`, and add `.maestro/35-appeal.yaml` asserting `POST /v1/appeals` **201**.

## Phase 20: Release gate — Phase D (US12–US14)

- [ ] T203 Run the real CI step list, the visibility matrix with the privacy axis and `pending-follower` and zero skipped rows, and SC-013/SC-014; dispatch the emulator workflow; write `docs/verification/runs/2026-09-09-008-phase-d.md`; check every Phase D box. **Phase D ships whole or not at all.**

**Checkpoint — Phase D may ship.**

---

## Phase 21: User Story 15 — Collections of saved posts (Priority: P3)

**Goal**: named, private collections; a post may be in more than one and **stays in the
undifferentiated saved list**.

**Independent test**: add to a collection, then confirm the post is still in `GET /v1/me/saved`
(FR-051); collections unreadable by anyone but their owner (SC-015).

### Tests for User Story 15

- [ ] T204 [P] [US15] Write `apps/e2e/journeys/collections.spec.ts`: a collection add is **additive**, not a move (FR-051), **and one post placed in two collections appears in both** (FR-049). The bug the first catches is a "move" nobody sees until they look for a post that was still saved; the second is the half of FR-049 that a single-collection fixture cannot exercise.
- [ ] T205 [P] [US15] Write `apps/api/tests/integration/collection-privacy.spec.ts` driving the request **directly** with another person's collection id (FR-050, SC-015).

### Implementation for User Story 15

- [ ] T206 [US15] Add `collection` and `collectionItem` keys to `keys.ts` — private by key, no index (A55, A56).
- [ ] T207 [US15] Create `apps/api/src/persistence/collection.repository.ts`.
- [ ] T208 [US15] Create `apps/api/src/modules/saved/collection.service.ts` (FR-049), writing the membership row **and** the `savedPost` rows (A32/A33) in one `TransactWriteItems`, so FR-051 cannot be violated by any path.
- [ ] T209 [US15] Add the collection CRUD and membership endpoints to `apps/api/src/modules/saved/saved.controller.ts`.
- [ ] T210 [US15] Make collection names reportable and moderatable in `apps/api/src/modules/safety/report.service.ts` and the removal path in `apps/api/src/modules/moderation/moderation.controller.ts` — user-generated text is content (Constitution IV; 005 established this for conversation names).
- [ ] T211 [US15] Register the collection posts read path as matrix surface 16 in `apps/api/tests/visibility/matrix.spec.ts` and add its assertion to `apps/api/tests/visibility/surface-routing.spec.ts`.
- [ ] T212 [P] [US15] Add the endpoints to `specs/001-interest-media-sharing/contracts/openapi.yaml` and update the snapshot in `apps/api/tests/integration/auth-surface.spec.ts`.
- [ ] T213 [US15] Add collections to `apps/mobile/src/features/profile/SavedScreen.tsx`.
- [ ] T214 [US15] Add `testID`s, run `verify-maestro-ids.mjs`, and add `.maestro/36-collections.yaml` asserting `POST /v1/me/collections` **201** and a `PUT` membership **204**.

---

## Phase 22: Polish, cross-cutting, and the Phase E gate

- [ ] T215 Run the real CI step list from `.github/workflows/ci.yml`, in order, for Release E, and record it in `docs/verification/runs/2026-09-09-008-phase-e.md`. Release E previously had no CI task of its own — its gate was the polish phase, which covered two of the four things every other gate requires.
- [ ] T216 Dispatch `.github/workflows/android-emulator.yml` for Release E's flows, read the whole-run API aggregate, and write the run record. Assert through the service — `POST /v1/me/collections` 201 — never through the view hierarchy.
- [ ] T217 Run `apps/api/tests/visibility/matrix.spec.ts` in full and confirm **zero skipped rows** across all 17 surfaces (SC-016). A larger green number is not the goal — 004 recorded that 462 assertions all running the same `decide()` would mean one function tested 66 times.
- [ ] T218 Confirm every new surface appears in `surface-routing.spec.ts` (FR-052), not only in the matrix.
- [ ] T219 Measure SC-017 across every control this feature added, using the split from T056: `apps/e2e/browser/safety-fit.spec.ts` for viewport, and a device run or a scaled component test for font. A browser result alone does not close SC-017 and must not be reported as if it did. Do not infer a rule from one measurement and apply it to unmeasured screens — that cost a 27-minute run and took the product from 18/19 to 1/19.
- [ ] T220 [P] Confirm `docs/verification/008-guard-red-log.md` has an entry for every structural guard: T010, T011, T037, T071, T087. A guard with no red observation is not yet a guard.
- [ ] T221 [P] Re-run `node scripts/verify-maestro-ids.mjs` over `.maestro/` and `.maestro/capture/`, and confirm no flow uses a `${VAR}` the device runner does not pass. Maestro substitutes the literal and waits thirty seconds rather than erroring.
- [ ] T222 [P] Add the new screens to `.maestro/capture/screens.yaml` so `docs/screens/android/` covers them.
- [ ] T223 [P] Update `specs/001-interest-media-sharing/contracts/openapi.yaml` to final and confirm the generated client builds (`pnpm --filter @sih/shared generate:client`).
- [ ] T224 Grep the **copy** across `apps/mobile/src/`, not only the code, for anything describing a behaviour this feature changed — the disabled-Following explanation above all. 007 shipped a follow hint describing a withdrawn requirement because only the code was updated.
- [ ] T225 Update `CLAUDE.md` with what 008 established, what it corrected, and **what remains unverified** — iOS, 002/SC-002, real usage, the datastore and hosting decisions. Report them plainly, never as met.
- [ ] T226 Confirm every box in `specs/008-post-reach-and-depth/tasks.md` is checked before reporting the feature complete. In 007 the checklist was right and the summary was not.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)** → **Foundational (2)** → everything else.
- **Release A (task phases 3–5, gate 6)** depends only on 1–2. It is the MVP and ships alone.
- **Release B (7–9, gate 10)**, **Release C (11–15, gate 16)** and **Release E (21, gate 22)**
  depend on 1–2 and on nothing in each other.
- **Release D (17–19, gate 20)** depends on Release C only for mentions being mutable
  content. If C slips, mute, privacy and appeals still stand.
- **Each release gate is its own phase**, not a footnote inside the last story's phase. A
  gate folded into a story phase is a gate that gets skipped with the story.

### User story dependencies

- US10 (alt text) sits behind **US1**: a description belongs to an image, and there are ten
  of them only once US1 ships.
- US8 and US9 touch `comment.service.ts` alongside US7 — same file, so sequential.
- US12 and US13 are the two halves of `contracts/selection-vs-boundary.md` and are best done
  adjacently, so the contrast is visible while both are fresh.

### Single-owner files — two agents editing these will overwrite each other

| File | Stories |
|---|---|
| `apps/api/src/persistence/keys.ts` | US2, US6, US11, US12, US14, US15 |
| `apps/api/tests/visibility/matrix.spec.ts` | US3, US6, US7, US13, US15 |
| `apps/api/src/modules/engagement/comment.service.ts` | US7, US8, US9 |
| `specs/001-interest-media-sharing/contracts/openapi.yaml` | every story |
| `apps/api/tests/integration/auth-surface.spec.ts` | every story adding a route |
| `apps/mobile/src/screens/index.tsx` | every mobile story |
| `docs/verification/divergence-register.md` | one writer only; `verify:register` checks it |

### Parallel opportunities

- **Phase 2**: T008–T011 are four different files.
- **US5**: T075–T079 are five independent call sites, once T074 exists.
- **Every story's test tasks** are marked [P] and precede its implementation.

## Parallel Example: User Story 5

```text
# After T074 (the projection) exists, five call sites in parallel:
T075  post-query.service.ts
T076  comment.service.ts
T077  notification.service.ts
T078  conversation.service.ts
T079  review-query.service.ts
```

## Implementation Strategy

### MVP first — Phase A only

Task phases 1–6, ending with the gate at T054–T059. That is **59 tasks** and delivers the
three stories that fix something currently wrong: nine of ten photographs become visible,
notifications become readable, and the Following tab stops being a promise.

Stop there and ship. Phase A depends on nothing later and nothing later depends on it except
US10.

### Incremental delivery

Each release phase ends with the same four things, because a phase that skips one is how 007
came to report eight phases finished with four tasks undone:

1. the real CI step list green — the list from `ci.yml`, not a proxy for it;
2. the visibility matrix with **zero skipped rows**, and every new surface also in
   `surface-routing.spec.ts`;
3. an Android device run asserted **through the service** — status codes in the run
   aggregate, which prints last and to `$GITHUB_STEP_SUMMARY`;
4. the boxes in this file actually checked.

### If this is parallelised

The single-owner table above is the constraint. `keys.ts`, the matrix and the OpenAPI
document are touched by nearly every story, so the genuinely independent lanes after Phase 2
are: **US5's five call sites**, **US6 (its own module)**, **US11 (its own module)** and the
mobile work of any story whose API half is done. Everything else contends.

Agent Teams needs an interactive session and a terminal agent panel and is **not usable in
the cloud web environment**; use subagents or the Workflow tool here.

## Notes

- **Tests before contracts, always.** T010, T011, T037, T071 and T087 are written before the
  code they govern, and each has a task that verifies it RED. A guard nobody has watched fail
  is not yet a guard.
- **Assert through the service on a device**, never through the view hierarchy. The whole-run
  API aggregate is the single most useful artifact in these runs; read it before forming a
  theory.
- **Make the failure visible before changing anything**, and prefer the free observation to
  the expensive guess. Six emulator runs, four Maestro runs and two chat-harness hangs in
  this project were each spent on a failure nobody had looked at.
