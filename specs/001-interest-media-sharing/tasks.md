---

description: "Task list for interest-centred media sharing"
---

# Tasks: Interest-Centred Media Sharing

**Input**: Design documents from `/specs/001-interest-media-sharing/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Test tasks are included. They are not optional coverage added by default — the design documents require them. [`contracts/visibility-matrix.md`](./contracts/visibility-matrix.md) states it is "a contract, not documentation… implemented directly as a table-driven test", and **SC-009 is that suite**. Research §D8 fixes the testing strategy, and every acceptance scenario in `spec.md` is already written as Given/When/Then. Tests outside that scope are kept proportionate.

**Organization**: Grouped by user story so each is independently implementable, testable, and demoable.

## 💰 Cost constraint (from [plan.md § Cost Posture](./plan.md))

**No task in this list provisions billable cloud resources.** Every task is completable on
the `local` runtime profile — DynamoDB Local, MinIO, ffmpeg, a local JWT issuer, all in
Docker, with no AWS account. Infrastructure-as-code is *written* and validated with
`cdk synth` (free, no account, no credentials); **applying it is not a task here** and
requires separate explicit approval.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: `[US1]`–`[US6]`, mapping to the prioritised user stories in `spec.md`
- Every task names an exact file path

## Path Conventions

pnpm workspace monorepo per `plan.md § Project Structure`:

- `apps/api/` — NestJS service
- `apps/mobile/` — Expo React Native client
- `apps/workers/` — event-driven handlers
- `packages/shared/` — types, zod schemas, generated client
- `infra/` — CDK (synth only)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Workspace, tooling, and the local Docker profile everything else runs on.

- [x] T001 Create pnpm workspace root with `pnpm-workspace.yaml`, root `package.json`, and shared `tsconfig.base.json` at repository root
- [x] T002 [P] Configure ESLint and Prettier with a shared config in `packages/config/eslint.config.js` and `packages/config/prettier.config.js`
- [x] T003 [P] Create `.env.example` at repository root with `RUNTIME_PROFILE=local`, DynamoDB/MinIO endpoints, table name `sih-main`, and bucket name `sih-media`
- [x] T004 Create `docker-compose.yml` at repository root running DynamoDB Local on `:8000` and MinIO on `:9000`/`:9001`, per `quickstart.md § Setup`
- [x] T005 [P] Scaffold `packages/shared/` with `package.json`, `tsconfig.json`, and `src/index.ts`
- [x] T006 [P] Scaffold NestJS app in `apps/api/` with `package.json`, `nest-cli.json`, and `src/main.ts`
- [x] T007 [P] Scaffold Expo development-build app in `apps/mobile/` with `app.config.ts` and `src/App.tsx` (dev build, not Expo Go — research §D4)
- [x] T008 [P] Scaffold worker handlers package in `apps/workers/` with `package.json` and `src/index.ts`
- [x] T009 [P] Scaffold CDK app in `infra/` with `cdk.json` and `bin/infra.ts` — **synth only; no deploy, bootstrap, or credentials**
- [x] T010 [P] Configure Jest projects for unit, integration, contract, and visibility suites in `apps/api/jest.config.ts`
- [x] T011 Implement `db:create-local` creating the `sih-main` single table with GSI1–GSI4 in `infra/scripts/create-local-table.ts`, matching `data-model.md § Key schema`
- [x] T012 [P] Implement `s3:create-local` creating the `sih-media` bucket in `infra/scripts/create-local-bucket.ts`
- [x] T013 Implement `seed:catalogue` writing the starting top-level interests in `infra/scripts/seed-catalogue.ts` (FR-021; a launch prerequisite per `spec.md § Assumptions`)
- [x] T014 Implement `verify:local` asserting all four local-profile dependencies in `infra/scripts/verify-local.ts` — a `TransactWriteItems` (FR-017), a presigned PUT and readback (FR-004), an ffmpeg encode producing poster and HLS (FR-009), and a token the API accepts
- [x] T015 [P] Add CI workflow running lint, typecheck, and the full local-profile test suite in `.github/workflows/ci.yml` — no cloud credentials

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared contract, persistence, ports, and — critically — the visibility choke point that every read path in every story must pass through.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Shared contract

- [x] T016 [P] Define shared zod schemas for `Visibility`, `ProcessingState`, and pagination in `packages/shared/src/schemas/common.ts` from `contracts/openapi.yaml`
- [x] T017 [P] Define shared entity types (Person, Post, Interest, MediaItem, Comment, Notification) in `packages/shared/src/types/entities.ts`
- [x] T018 Generate the typed API client from `contracts/openapi.yaml` into `packages/shared/src/client/` with a codegen script in `packages/shared/scripts/generate-client.ts`

### Configuration and runtime profile

- [x] T019 Implement profile-aware configuration loading `RUNTIME_PROFILE` and endpoints in `apps/api/src/config/configuration.ts` (research §D9)
- [x] T020 Decide the video duration and size caps and express them as configuration in `apps/api/src/config/media.limits.ts` (FR-005 — carried as an open item from `plan.md § Risks`; **blocks the upload-validation task in Phase 3**, which cannot validate against an undecided number)
- [x] T021 [P] Implement RFC 9457 problem-detail error filter in `apps/api/src/common/errors/problem.filter.ts`
- [x] T022 [P] Implement structured request logging middleware in `apps/api/src/common/logging/logger.middleware.ts`

### Ports and adapters (research §D9)

- [x] T023 [P] Define the port interfaces in `apps/api/src/ports/object-store.port.ts`, `media-processor.port.ts`, `identity-provider.port.ts`, and `event-bus.port.ts`
- [x] T024 [P] Implement the MinIO `ObjectStore` adapter with presigned URL issuance in `apps/api/src/adapters/local/minio-object-store.ts`
- [x] T025 [P] Implement the ffmpeg `MediaProcessor` adapter (container-invoked) in `apps/api/src/adapters/local/ffmpeg-media-processor.ts`
- [x] T026 [P] Implement the local JWT `IdentityProvider` adapter with a seeded signing key in `apps/api/src/adapters/local/local-identity-provider.ts`
- [x] T027 [P] Implement the in-process `EventBus` adapter in `apps/api/src/adapters/local/in-process-event-bus.ts`
- [x] T028 [P] Implement the S3 `ObjectStore` adapter in `apps/api/src/adapters/aws/s3-object-store.ts` (written and unit-tested; never applied)
- [x] T029 [P] Implement the MediaConvert `MediaProcessor` adapter in `apps/api/src/adapters/aws/mediaconvert-media-processor.ts` — see the divergence warning in research §D9
- [x] T030 [P] Implement the Cognito `IdentityProvider` adapter in `apps/api/src/adapters/aws/cognito-identity-provider.ts`
- [x] T031 Write a shared port contract test both adapter sets must satisfy in `apps/api/tests/contract/ports.contract.spec.ts`
- [x] T032 Wire adapter selection by `RUNTIME_PROFILE` in `apps/api/src/adapters/adapters.module.ts`

### Persistence (no adapter — DynamoDB Local is the same API)

- [x] T033 Implement the DynamoDB document client factory in `apps/api/src/persistence/dynamo-client.ts`
- [x] T034 Implement key builders for every entity's `pk`/`sk`/GSI keys in `apps/api/src/persistence/keys.ts`, matching `data-model.md` exactly
- [x] T035 [P] Implement the base single-table repository with query, paging, and transaction helpers in `apps/api/src/persistence/base.repository.ts`
- [x] T036 [P] Implement opaque cursor encoding and decoding in `apps/api/src/persistence/cursor.ts` (FR-035 — position-preserving, never offsets)
- [x] T037 [P] Implement `PersonRepository` in `apps/api/src/persistence/person.repository.ts` (access patterns A1, A2)
- [x] T038 [P] Implement `InterestRepository` with hierarchy reads in `apps/api/src/persistence/interest.repository.ts` (A12, A13, A14)
- [x] T039 [P] Implement `PersonFollowRepository` in `apps/api/src/persistence/person-follow.repository.ts` (A10 — the authority for FR-015, needed by the visibility filter before US4 exists)
- [x] T040 [P] Implement `BlockRepository` in `apps/api/src/persistence/block.repository.ts` (A18 — the visibility filter consults blocks in both directions)

### Auth, rate limiting, catalogue

- [x] T041 Implement the authentication guard resolving the viewer from an `IdentityProvider` token in `apps/api/src/common/auth/auth.guard.ts` (FR-001)
- [x] T042 [P] Implement the per-person token-bucket rate limiter in `apps/api/src/common/rate-limit/rate-limit.guard.ts` (FR-046)
- [x] T043 Implement the in-process interest catalogue cache, refreshed from DynamoDB Streams, behind a `CatalogueSearch` interface in `apps/api/src/modules/interests/catalogue.cache.ts` (research §D3 — the seam OpenSearch replaces later)

### The visibility choke point (research §D6)

- [x] T044 Implement `VisibilityFilter` taking a viewer and a candidate set and returning only permitted posts in `apps/api/src/visibility/visibility.filter.ts` (FR-014, FR-015, FR-016, FR-044)
- [x] T045 Implement the per-request relationship cache for follow and block point reads in `apps/api/src/visibility/relationship.cache.ts` (keeps A10/A18 cheap on the feed hot path)
- [x] T046 Build the generated visibility matrix suite — 7 post states × 6 viewer relationships × 7 surfaces, derived from `contracts/visibility-matrix.md` — in `apps/api/tests/visibility/matrix.spec.ts` (**this suite is SC-009**; surfaces not yet built are skipped and enabled by their story)
- [x] T047 [P] Unit-test the visibility filter's block-in-both-directions and interest-follow-grants-nothing rules in `apps/api/tests/unit/visibility.filter.spec.ts` (the two easy mistakes named in the contract)

### Health

- [x] T048 Implement `GET /v1/health` reporting status, active profile, and catalogue size in `apps/api/src/modules/health/health.controller.ts`

**Checkpoint**: Foundation ready. `pnpm --filter @sih/infra verify:local` passes and the visibility matrix runs (with story surfaces skipped). User story work can begin.

---

## Phase 3: User Story 1 - Publish media to an interest (Priority: P1) 🎯 MVP

**Goal**: A signed-in person selects photos or a video, assigns an interest, sets visibility, and publishes; the post appears in that interest's space and on their profile.

**Independent Test**: Sign in, upload one image and one video against a chosen interest, confirm both render in that interest's space and on the author's profile. Publishing without an interest is refused; publishing without touching visibility yields a public post.

### Tests for User Story 1

- [x] T049 [P] [US1] Contract test for `POST /media/uploads` and `POST /posts` in `apps/api/tests/contract/posts.contract.spec.ts`
- [x] T050 [P] [US1] Integration test `us1-publish` covering all six acceptance scenarios in `apps/api/tests/integration/us1-publish.spec.ts`
- [x] T051 [P] [US1] EXIF-strip verification test that uploads GPS-tagged media **through a client that skips its own stripping**, in `apps/api/tests/integration/us1-exif.spec.ts` (FR-010 is a server-side guarantee; testing only the well-behaved client proves nothing)

### Implementation for User Story 1

- [x] T052 [P] [US1] Implement `PostRepository` with the post item and media items in one partition in `apps/api/src/persistence/post.repository.ts` (A3)
- [x] T053 [P] [US1] Implement `PostInterestIndexRepository` writing one index item per expanded interest in `apps/api/src/persistence/post-interest-index.repository.ts` (A4, FR-024)
- [x] T054 [US1] Implement `UploadService` validating type, size, and duration **before** issuing a presigned target in `apps/api/src/modules/media/upload.service.ts` (FR-005 — the caller learns of a limit up front, not after a long upload; uses the caps decided in Phase 2)
- [x] T055 [US1] Implement `POST /media/uploads` in `apps/api/src/modules/media/media.controller.ts` (FR-004, FR-005, FR-008)
- [x] T056 [US1] Implement `PostService.create` requiring at least one interest and expanding sub-interest to parent in `apps/api/src/modules/posts/post.service.ts` (FR-006, FR-024)
- [x] T057 [US1] Implement transactional post creation writing the post, media items, and index items atomically in `apps/api/src/modules/posts/post.transaction.ts`
- [x] T058 [US1] Implement `POST /posts` in `apps/api/src/modules/posts/post.controller.ts` (FR-006, FR-007, FR-013)
- [x] T059 [US1] Implement `GET /posts/{postId}` routed through `VisibilityFilter`, distinguishing 403 from 404 in `apps/api/src/modules/posts/post.controller.ts` (FR-042 error table)
- [x] T060 [P] [US1] Implement the image derivation worker producing variants and **stripping EXIF**, gating `exifStripped` before `ready`, in `apps/workers/src/media-image/handler.ts` (FR-010)
- [x] T061 [P] [US1] Implement the video derivation worker producing HLS renditions and a poster frame via the `MediaProcessor` port in `apps/workers/src/media-video/handler.ts` (FR-009)
- [x] T062 [US1] Implement processing-state aggregation promoting a post to `ready` only when every media item is ready in `apps/api/src/modules/posts/processing.service.ts`
- [x] T063 [US1] Enable the interest-space and profile surfaces in the visibility matrix suite in `apps/api/tests/visibility/matrix.spec.ts`
- [x] T064 [P] [US1] Build the media picker screen in `apps/mobile/src/features/publish/MediaPickerScreen.tsx`
- [x] T065 [P] [US1] Build the interest selector, blocking publish until one is chosen, in `apps/mobile/src/features/publish/InterestSelector.tsx` (FR-006)
- [x] T066 [P] [US1] Build the visibility control defaulting to public in `apps/mobile/src/features/publish/VisibilityControl.tsx` (FR-013)
- [x] T067 [US1] Build the compose-and-publish screen with upload progress and retry that does not re-select media in `apps/mobile/src/features/publish/ComposeScreen.tsx` (FR-008)
- [x] T068 [P] [US1] Build the post detail view with video playback and poster frame in `apps/mobile/src/features/posts/PostDetailScreen.tsx`
- [x] T069 [P] [US1] Add the Maestro publish-journey flow in `apps/mobile/e2e/us1-publish.yaml`

**Checkpoint**: US1 fully functional. A person can publish and see their post. **This is the MVP** — stop here and validate.

---

## Phase 4: User Story 2 - Discover content by interest (Priority: P2)

**Goal**: Browse by interest — open a top-level interest, see its sub-interests and their posts rolled up, drill in, and search interests by name.

**Independent Test**: Seed posts across sub-interests under different parents; opening any interest shows its own posts plus its sub-interests', and nothing from unrelated branches.

### Tests for User Story 2

- [x] T070 [P] [US2] Contract test for the `/interests` endpoints in `apps/api/tests/contract/interests.contract.spec.ts`
- [x] T071 [P] [US2] Integration test `us2-discover` covering the five acceptance scenarios in `apps/api/tests/integration/us2-discover.spec.ts`
- [x] T072 [P] [US2] Unit-test near-duplicate matching against the normalised name and parent scope in `apps/api/tests/unit/interest-similarity.spec.ts`

### Implementation for User Story 2

- [x] T073 [US2] Implement two-level hierarchy validation rejecting deeper nesting and non-top-level parents in `apps/api/src/modules/interests/hierarchy.validator.ts` (FR-020)
- [x] T074 [US2] Implement prefix and fuzzy matching over the cached catalogue in `apps/api/src/modules/interests/catalogue.search.ts` (FR-023, FR-026 — research §D3)
- [x] T075 [US2] Implement content-policy screening of a proposed sub-interest name in `apps/api/src/modules/interests/name-policy.ts` (FR-031 — without this an abusive name goes live and stays live until someone happens to report it)
- [x] T076 [US2] Implement `InterestService.createSubInterest` with a conditional write on the GSI3 key in `apps/api/src/modules/interests/interest.service.ts` (FR-022, FR-023, FR-031 — rejects on a name-policy violation before the conditional write)
- [x] T077 [US2] Implement `GET /interests` browse and type-ahead search in `apps/api/src/modules/interests/interest.controller.ts` (FR-025, FR-026)
- [x] T078 [US2] Implement `GET /interests/similar` so the duplicate warning appears while typing, not as a rejection, in `apps/api/src/modules/interests/interest.controller.ts` (FR-023)
- [x] T079 [US2] Implement `POST /interests` returning 409 with candidates on near-duplicate in `apps/api/src/modules/interests/interest.controller.ts` (FR-022, FR-023)
- [x] T080 [US2] Implement `GET /interests/{interestId}` including sub-interests for top-level and a 301 for merged in `apps/api/src/modules/interests/interest.controller.ts` (FR-025, FR-030)
- [x] T081 [US2] Implement `GET /interests/{interestId}/posts` with parent roll-up, visibility filtering, and cursor paging in `apps/api/src/modules/interests/interest-posts.controller.ts` (FR-024, FR-025, FR-035)
- [x] T082 [US2] Enable the interest-search surface in the visibility matrix suite in `apps/api/tests/visibility/matrix.spec.ts` (post counts must not leak restricted posts)
- [x] T083 [P] [US2] Build the interest browse screen listing sub-interests and rolled-up posts in `apps/mobile/src/features/discover/InterestScreen.tsx`
- [x] T084 [P] [US2] Build interest type-ahead search showing each sub-interest's parent in `apps/mobile/src/features/discover/InterestSearchScreen.tsx` (FR-026)
- [x] T085 [P] [US2] Build the sub-interest creation flow surfacing near-duplicates before submission in `apps/mobile/src/features/discover/CreateInterestScreen.tsx`
- [x] T086 [P] [US2] Implement cursor-paged infinite scroll preserving position in `apps/mobile/src/components/PagedPostList.tsx` (FR-035)
- [x] T087 [P] [US2] Add the Maestro browse-journey flow in `apps/mobile/e2e/us2-discover.yaml`

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 - Follow interests to build a personal feed (Priority: P3)

**Goal**: Follow interests at either level; the home feed is assembled from them.

**Independent Test**: Follow three interests, publish across followed and unfollowed ones, confirm the home feed contains only followed-interest posts — **including posts in sub-interests created after the follow**.

### Tests for User Story 3

- [x] T088 [P] [US3] Integration test `us3-follow-interests` covering the four acceptance scenarios in `apps/api/tests/integration/us3-follow-interests.spec.ts`
- [x] T089 [P] [US3] Integration test asserting a parent-interest follow covers a sub-interest **created after** the follow, in `apps/api/tests/integration/us3-late-subinterest.spec.ts` (the case read-time expansion exists to handle)
- [x] T090 [P] [US3] Unit-test read-time expansion of followed interests against the catalogue in `apps/api/tests/unit/follow-expansion.spec.ts`

### Implementation for User Story 3

- [x] T091 [P] [US3] Implement `InterestFollowRepository` in `apps/api/src/persistence/interest-follow.repository.ts` (A6, A7, A8)
- [x] T092 [US3] Implement follow and unfollow with the 200-interest cap as a conditional write in `apps/api/src/modules/interests/interest-follow.service.ts` (FR-027, research §D1)
- [x] T093 [US3] Implement read-time expansion of a parent follow to its sub-interests in `apps/api/src/modules/feed/follow-expansion.ts` (FR-028 — no follow row per sub-interest, so new ones need no back-fill)
- [x] T094 [US3] Implement `PUT`/`DELETE /interests/{interestId}/follow` in `apps/api/src/modules/interests/interest-follow.controller.ts` (FR-027)
- [x] T095 [US3] Implement read-time fan-in feed assembly — parallel query per followed interest, merge, visibility-filter, cache the page — in `apps/api/src/modules/feed/feed.service.ts` (FR-032, research §D1)
- [x] T096 [US3] Implement `GET /feed/home` with cursor paging and empty-state hints in `apps/api/src/modules/feed/feed.controller.ts` (FR-032, FR-035, FR-036)
- [x] T097 [US3] Implement `GET /interests/suggested` in `apps/api/src/modules/interests/interest.controller.ts` (FR-029, measured by SC-006)
- [x] T098 [US3] Enable the home-feed surface in the visibility matrix suite in `apps/api/tests/visibility/matrix.spec.ts`
- [x] T099 [P] [US3] Build the home feed screen with the no-followed-interests onboarding state in `apps/mobile/src/features/feed/HomeFeedScreen.tsx` (FR-036)
- [x] T100 [P] [US3] Build the follow/unfollow control and onboarding interest picker in `apps/mobile/src/features/discover/FollowInterestControl.tsx`

**Checkpoint**: The core loop works — publish, discover, follow, return to a personal feed.

---

## Phase 6: User Story 4 - Follow people within followed interests (Priority: P4)

**Goal**: Follow a person; their posts gain prominence **only inside interests the follower also follows**.

**Independent Test**: B posts to interests X and Y. A follows B and follows only X. B's post in X appears with prominence; **B's post in Y does not appear at all**.

### Tests for User Story 4

- [x] T101 [P] [US4] Integration test `us4-follow-people` covering the four acceptance scenarios in `apps/api/tests/integration/us4-follow-people.spec.ts`
- [x] T102 [P] [US4] Integration test asserting a followed person's post in an unfollowed interest never reaches the feed, in `apps/api/tests/integration/us4-fr033-boundary.spec.ts` (**the guard against the feed quietly becoming an ordinary follower feed**)
- [x] T103 [P] [US4] Unit-test feed ranking prominence for followed authors within an interest in `apps/api/tests/unit/feed-ranking.spec.ts`

### Implementation for User Story 4

- [x] T104 [US4] Implement person follow and unfollow, refusing when a block exists in either direction, in `apps/api/src/modules/people/person-follow.service.ts` (FR-037, FR-044)
- [x] T105 [US4] Implement `PUT`/`DELETE /people/{handle}/follow` in `apps/api/src/modules/people/person-follow.controller.ts` (FR-037)
- [x] T106 [US4] Implement the FR-033 intersection rule in feed assembly — followed-author posts admitted only within followed interests — in `apps/api/src/modules/feed/feed.service.ts`
- [x] T107 [US4] Implement followed-author prominence in feed ranking in `apps/api/src/modules/feed/ranking.ts` (FR-034)
- [x] T108 [US4] Implement `GET /people/{handle}` with follower and following counts and top interests in `apps/api/src/modules/people/person.controller.ts` (FR-038)
- [x] T109 [US4] Implement `GET /people/{handle}/posts` through the visibility filter in `apps/api/src/modules/people/person.controller.ts` (FR-038)
- [x] T110 [P] [US4] Build the profile screen with follow control and counts in `apps/mobile/src/features/profile/ProfileScreen.tsx`

**Checkpoint**: Creators have an audience without the interest focus eroding.

---

## Phase 7: User Story 5 - Engage with and share posts (Priority: P5)

**Goal**: React, comment, and share a post outward via a link that honours the author's visibility.

**Independent Test**: React twice and confirm the count does not double; open a public post's link signed out; open a followers-only post's link as a non-follower and get "not available to you"; open a deleted post's link and get "no longer available".

### Tests for User Story 5

- [x] T111 [P] [US5] Contract test for reaction, comment, and share-link endpoints in `apps/api/tests/contract/engagement.contract.spec.ts`
- [x] T112 [P] [US5] Integration test `us5-engage` covering the five acceptance scenarios in `apps/api/tests/integration/us5-engage.spec.ts`
- [x] T113 [P] [US5] Integration test asserting a blocked viewer gets **404, not 403**, on a share link, in `apps/api/tests/integration/us5-block-disclosure.spec.ts` (a 403 would confirm the post exists and disclose the block)

### Implementation for User Story 5

- [x] T114 [P] [US5] Implement `ReactionRepository` whose key structure enforces one reaction per person per post in `apps/api/src/persistence/reaction.repository.ts` (A16, FR-039)
- [x] T115 [P] [US5] Implement `CommentRepository` in `apps/api/src/persistence/comment.repository.ts` (A15)
- [x] T116 [US5] Implement reaction add and remove as a guarded transaction so a double-tap cannot double-count in `apps/api/src/modules/engagement/reaction.service.ts` (FR-039)
- [x] T117 [US5] Implement `PUT`/`DELETE /posts/{postId}/reaction` in `apps/api/src/modules/engagement/engagement.controller.ts`
- [x] T118 [US5] Implement comment creation and listing, readable exactly when the post is, in `apps/api/src/modules/engagement/comment.service.ts` (FR-040)
- [x] T119 [US5] Implement `GET`/`POST /posts/{postId}/comments` in `apps/api/src/modules/engagement/engagement.controller.ts`
- [x] T120 [US5] Implement `POST /posts/{postId}/share-link` returning the link and echoing visibility in `apps/api/src/modules/engagement/share.controller.ts` (FR-041)
- [x] T121 [US5] Implement share-link resolution against **current** visibility, with the 403/404 disclosure rules, in `apps/api/src/modules/posts/share-resolution.service.ts` (FR-042)
- [x] T122 [US5] Enable the share-link and comments surfaces in the visibility matrix suite in `apps/api/tests/visibility/matrix.spec.ts`
- [x] T123 [P] [US5] Build reaction and comment UI in `apps/mobile/src/features/engagement/EngagementBar.tsx`
- [x] T124 [P] [US5] Build the comment thread screen in `apps/mobile/src/features/engagement/CommentsScreen.tsx`
- [x] T125 [P] [US5] Build share-sheet integration warning that a followers-only link will not open for everyone in `apps/mobile/src/features/engagement/ShareAction.tsx`
- [x] T126 [P] [US5] Build the signed-out share-link landing state with a join prompt in `apps/mobile/src/features/posts/SharedPostScreen.tsx`

**Checkpoint**: The product is social — engagement and outward sharing both work.

---

## Phase 8: User Story 6 - Manage your profile and your content (Priority: P6)

**Goal**: Edit, re-file, re-scope, and delete your own posts; maintain your profile.

**Independent Test**: Edit a caption, move a post to a different interest, flip it public→private, and delete it — confirming each change lands everywhere the post appeared and that existing share links stop resolving.

### Tests for User Story 6

- [x] T127 [P] [US6] Integration test `us6-manage` covering the three acceptance scenarios in `apps/api/tests/integration/us6-manage.spec.ts`
- [x] T128 [P] [US6] Integration test asserting a public→private flip removes the post from every surface **and** invalidates outstanding share links, in `apps/api/tests/integration/us6-visibility-propagation.spec.ts` (FR-017 — the requirement that shaped the whole feed design)

### Implementation for User Story 6

- [x] T129 [US6] Implement transactional post updates keeping the post item and its index items consistent in `apps/api/src/modules/posts/post-update.transaction.ts` (FR-011, FR-017)
- [x] T130 [US6] Implement re-filing, deleting old index items and writing new ones in the same transaction, in `apps/api/src/modules/posts/post.service.ts` (FR-011)
- [x] T131 [US6] Implement `PATCH /posts/{postId}` for caption, interests, and visibility in `apps/api/src/modules/posts/post.controller.ts` (FR-011, FR-017)
- [x] T132 [US6] Implement soft delete removing the post from every surface in `apps/api/src/modules/posts/post.service.ts` (FR-012)
- [x] T133 [US6] Implement `DELETE /posts/{postId}` in `apps/api/src/modules/posts/post.controller.ts` (FR-012)
- [x] T134 [US6] Implement `GET`/`PATCH /me` for profile and notification preferences in `apps/api/src/modules/people/me.controller.ts` (FR-002, FR-049)
- [x] T135 [P] [US6] Build the post edit screen covering caption, interest, and visibility in `apps/mobile/src/features/posts/EditPostScreen.tsx`
- [x] T136 [P] [US6] Build the profile edit screen in `apps/mobile/src/features/profile/EditProfileScreen.tsx`

**Checkpoint**: All six user stories are independently functional.

---

## Phase 9: Cross-Cutting - Safety, Moderation & Notifications

**Purpose**: FR-003 and FR-043 to FR-049 span every story rather than belonging to one. They are grouped here so they stay visible instead of dissolving into polish.

### Safety

- [x] T137 [P] Implement `ReportRepository` with the moderation-queue GSI in `apps/api/src/persistence/report.repository.ts` (A19)
- [x] T138 Implement reporting for posts, comments, **and sub-interest names** in `apps/api/src/modules/safety/report.service.ts` (FR-043 — all three subject types)
- [x] T139 Implement `POST /reports` in `apps/api/src/modules/safety/safety.controller.ts` (FR-043)
- [x] T140 Implement blocking as a transaction that also severs follows in both directions in `apps/api/src/modules/safety/block.service.ts` (FR-044)
- [x] T141 Implement `PUT`/`DELETE /blocks/{handle}` in `apps/api/src/modules/safety/safety.controller.ts` (FR-044)
- [x] T142 [P] Integration test asserting a block withdraws previously visible followers-only content in `apps/api/tests/integration/safety-block.spec.ts`

### Moderation

- [x] T143 [P] Implement the append-only moderation audit log in `apps/api/src/persistence/moderation-log.repository.ts` (FR-047 — survives deletion of the subject)
- [x] T144 Implement operator authorisation in `apps/api/src/common/auth/operator.guard.ts` (FR-021, FR-045)
- [x] T145 Implement `GET /moderation/reports` oldest-first in `apps/api/src/modules/moderation/moderation.controller.ts` (FR-045; the ordering is what makes SC-010 measurable)
- [x] T146 Implement `PATCH /moderation/reports/{reportId}` writing an audit entry and notifying the author in `apps/api/src/modules/moderation/moderation.controller.ts` (FR-045, FR-047)
- [x] T147 Implement the interest merge, re-parent, and retire job — idempotent, batched, with a visible progress state — in `apps/workers/src/interest-jobs/handler.ts` (FR-030)
- [x] T148 Implement `PATCH /moderation/interests/{interestId}` returning 202 with a job, refusing retirement that would orphan posts, in `apps/api/src/modules/moderation/interest-admin.controller.ts` (FR-030)
- [x] T149 [P] Integration test `interest-merge` covering redirect-while-merging, follower carry-across, idempotent re-run, and refusal to orphan, in `apps/api/tests/integration/interest-merge.spec.ts`
- [x] T150 [P] Integration test `moderation` covering all three subject types, queue ordering, and audit durability in `apps/api/tests/integration/moderation.spec.ts`

### Notifications and account deletion

- [x] T151 [P] Implement `NotificationRepository` with TTL in `apps/api/src/persistence/notification.repository.ts` (A20)
- [x] T152 Implement notification generation checking **both** preferences and the visibility filter in `apps/api/src/modules/notifications/notification.service.ts` (FR-048 — a notification must never leak an unopenable post)
- [x] T153 Implement `GET /notifications` in `apps/api/src/modules/notifications/notification.controller.ts` (FR-048)
- [x] T154 Enable the notifications surface in the visibility matrix suite in `apps/api/tests/visibility/matrix.spec.ts` — **completing all seven surfaces and closing SC-009**
- [x] T155 Implement account deletion returning the retention outcome immediately and enqueuing the purge in `apps/api/src/modules/people/account-deletion.service.ts` (FR-003)
- [x] T156 Implement the purge and comment-anonymisation worker in `apps/workers/src/account-deletion/handler.ts` (FR-003)
- [x] T157 Make the visibility filter treat a non-`active` author as having no followers in `apps/api/src/visibility/visibility.filter.ts` (FR-003 — followers-only content becomes inaccessible before the purge completes)
- [x] T158 [P] Build the notifications screen and per-category preference toggles in `apps/mobile/src/features/notifications/NotificationsScreen.tsx` (FR-048, FR-049)
- [x] T159 [P] Build report and block actions in `apps/mobile/src/features/safety/SafetyActions.tsx` (FR-043, FR-044)

---

## Phase 10: Polish & Validation

**Purpose**: Cross-cutting quality, performance evidence, and the success-criteria checks.

- [ ] T160 [P] Implement the analytics export to S3 for Athena-backed SC-007 and SC-008 in `apps/workers/src/analytics-export/handler.ts` (aggregation never touches the operational table)
- [ ] T161 [P] Implement the load-data seeder in `infra/scripts/seed-load.ts` (100k posts, 5k interests, 10k people)
- [ ] T162 Implement `bench:feed` reporting p95 **broken down by follow count** in `apps/api/bench/feed.bench.ts` (SC-005; watch the curve, not the headline — research §D1 accepts that read-time assembly scales with follow count)
- [ ] T163 [P] Implement `bench:upload` in `apps/api/bench/upload.bench.ts` (SC-002)
- [ ] T164 Implement a concurrency load test driving the home feed at 10 000 concurrent viewers and reporting p95 **under load** in `apps/api/bench/feed-load.bench.ts` (SC-011 — the criterion most likely to invalidate the read-time fan-in bet in research §D1)
- [ ] T165 [P] Implement `bench:transcode` measuring upload-finished to playable latency in `apps/api/bench/transcode.bench.ts` (SC-003 — measures the ffmpeg adapter only; the MediaConvert path is covered by the smoke-test procedure task)
- [ ] T166 [P] Emit publish-funnel analytics events (started, interest chosen, visibility set, published, abandoned) in `apps/mobile/src/lib/analytics.ts` (SC-001, SC-004 — time-to-first-post and first-attempt success rate are otherwise unmeasurable)
- [ ] T167 [P] Write the CDK stack for table, GSIs, buckets, Fargate service, Lambdas, and CloudFront in `infra/lib/infra-stack.ts` — **validated with `cdk synth` only; deploying is out of scope and requires explicit approval**
- [ ] T168 [P] Add a `cdk synth` check to CI in `.github/workflows/ci.yml` (no credentials, no deploy)
- [ ] T169 [P] Write the MediaConvert smoke-test procedure in `docs/mediaconvert-smoke-test.md` (research §D9 — green ffmpeg tests are **not** evidence the `aws` path works; this runs against a staging account before launch, when one exists)
- [ ] T170 [P] Add offline tolerance so loaded content stays viewable and actions queue in `apps/mobile/src/lib/offline-queue.ts` (spec edge case)
- [ ] T171 Run the full `quickstart.md` validation end to end and record results in `specs/001-interest-media-sharing/validation-report.md`
- [ ] T172 [P] Write the developer README covering local profile setup and the cloud-sandbox path in `README.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks every user story**
- **US1 (Phase 3)**: depends on Phase 2 only
- **US2 (Phase 4)**: depends on Phase 2. Independently testable, though richer with US1 content
- **US3 (Phase 5)**: depends on Phase 2. Needs interests to follow, so demos best after US2
- **US4 (Phase 6)**: depends on Phase 2 **and US3** — FR-033 admits followed-author posts only within followed interests, so the interest-follow feed must exist first. This is the one genuine cross-story dependency
- **US5 (Phase 7)**: depends on Phase 2 and US1 (posts to engage with)
- **US6 (Phase 8)**: depends on Phase 2 and US1 (posts to manage)
- **Cross-Cutting (Phase 9)**: depends on the stories whose surfaces it touches; T154 closes SC-009 and needs every surface built
- **Polish (Phase 10)**: last

### Critical path

`Phase 1 → Phase 2 → US1` is the shortest route to something demoable. **T044–T047 (the visibility choke point) gate everything** — no read path may be written before the filter exists, or modules will grow their own predicates and SC-009 becomes unprovable.

### Within each user story

Repositories → services → controllers → mobile screens. Tests first where they define the contract (T046, T051, T102, T113, T128 in particular).

### Parallel Opportunities

- Phase 1: T002, T003, T005–T010, T012, T015 in parallel
- Phase 2: the four local adapters (T024–T027) and the three AWS adapters (T028–T030) in parallel; repositories T037–T040 in parallel
- Within each story: mobile screens run parallel to each other and to API work once the contract is generated
- Across stories: US2 and US5 can proceed in parallel after US1; US4 must wait for US3

---

## Parallel Example: User Story 1

```bash
# Tests first — they define the contract:
Task: "Contract test for POST /media/uploads and POST /posts in apps/api/tests/contract/posts.contract.spec.ts"
Task: "Integration test us1-publish in apps/api/tests/integration/us1-publish.spec.ts"
Task: "EXIF-strip verification test in apps/api/tests/integration/us1-exif.spec.ts"

# Repositories in parallel:
Task: "Implement PostRepository in apps/api/src/persistence/post.repository.ts"
Task: "Implement PostInterestIndexRepository in apps/api/src/persistence/post-interest-index.repository.ts"

# Mobile screens in parallel with API work:
Task: "Build media picker in apps/mobile/src/features/publish/MediaPickerScreen.tsx"
Task: "Build interest selector in apps/mobile/src/features/publish/InterestSelector.tsx"
Task: "Build visibility control in apps/mobile/src/features/publish/VisibilityControl.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: Setup — workspace and the local Docker profile
2. Phase 2: Foundational — **critical**; the visibility filter blocks all stories
3. Phase 3: US1 — publish
4. **STOP and VALIDATE**: run `us1-publish`, `us1-exif`, and the visibility matrix
5. Demo: a person can publish media under an interest and see it appear

### Incremental Delivery

| Increment | Adds |
|---|---|
| Setup + Foundational | Nothing demoable, everything enabling |
| + US1 | **MVP** — publishing works |
| + US2 | Browsing by interest — the product's differentiator is visible |
| + US3 | A reason to return — a personal feed |
| + US4 | Creators gain an audience |
| + US5 | It becomes social; outward sharing brings people in |
| + US6 | Control and trust |
| + Phase 9 | Safe to put in front of real people |

**Do not ship publicly before Phase 9.** US1–US6 give a working product with no reporting, blocking, or moderation — untenable for a consumer app carrying user-uploaded media.

### Parallel Team Strategy

After Phase 2: Developer A on US1, Developer B on US2, Developer C starts Phase 9's safety work (it depends on foundational blocks, not on stories). US3 follows US2's developer; US4 waits for US3.

---

## Notes

- Every task runs on the `local` profile. No task provisions billable cloud resources; `cdk synth` is free and needs no account
- `[P]` = different files, no dependency on incomplete work
- The visibility matrix (T046) grows across phases — each story enables its surfaces, and T154 closes SC-009
- Commit after each task or logical group; stop at any checkpoint to validate a story independently
- `.specify/memory/constitution.md` is still the unfilled template, so no principles constrained this ordering. A test-first principle in particular would move test tasks ahead of implementation throughout
