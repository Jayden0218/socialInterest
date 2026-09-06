---

description: "Task list for feature 004 — conversations, places, and the depth the product is missing"
---

# Tasks: Conversations, places, and the depth the product is missing

**Input**: Design documents from `/specs/004-chat-places-and-depth/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Included, and **scoped**. The constitution mandates test-first only where a
document declares itself a contract; it deliberately does not mandate TDD across the board.
So the contract tests — the visibility matrix addendum and the `ConversationAccess` table —
are written first and must fail. Journey tests are written first too, for a different and
harder-won reason: every defect this codebase has actually shipped was invisible to a unit
test and visible to a request.

**Organization**: by user story, so each is independently implementable and testable.

## ⚠️ Two gates before starting — see [plan.md § Gates](./plan.md#gates-for-the-owner--decisions-not-research)

- **G1**: `003/datastore-decision.md` is open. This adds five repositories to thirteen.
- **G2**: reviews/ratings on a place page and group chat are out of scope by decision.

Neither blocks task generation. Both change what this work costs, and G1 changes it a lot.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: US1–US5 from [spec.md](./spec.md)

## Path conventions

Monorepo, pnpm workspace: `apps/api`, `apps/mobile`, `apps/e2e`, `apps/workers`,
`packages/shared`, `infra`, `.maestro`. Paths below are repository-relative and real.

## 🔒 Single-owner files

Two agents editing any of these overwrite each other. Assign one owner each.

| File | Tasks touching it |
|---|---|
| `apps/api/tests/visibility/matrix.spec.ts` | T010, T011, T040, T071, T096, T122, T128 |
| `apps/mobile/src/App.tsx` | T026, T053, T084, T111, T125 |
| `apps/mobile/src/screens/index.tsx` | T052, T084, T100, T111, T125 |
| `apps/api/src/persistence/post.repository.ts` | T066, T067, T068 |
| `apps/mobile/src/data/index.ts` | T048, T078, T110, T123 |
| `docs/verification/divergence-register.md` | T005, T134 |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the table, the keys, and the fixtures every story needs. Nothing here is
story-specific and nothing here provisions anything.

- [ ] T001 Add **GSI5 (Inbox)** — `gsi5pk` / `gsi5sk`, projection `KEYS_ONLY` plus `conversationId`, `otherPersonId`, `state`, `lastMessageAt`, `lastReadAt`, `unreadCount`, `lastMessagePreview` — to the local table definition in `infra/scripts/create-local-table.ts`
- [ ] T002 [P] Mirror GSI5 into the CDK table in `infra/lib/infra-stack.ts`. **`cdk synth` only — never `cdk deploy`.** Applying IaC is a separately approved action and is not part of this task
- [ ] T003 [P] Add key builders for `CONV#`, `MSG#`, `PLACE#`, `PLACEFOLLOW#`, `SAVE#`, `SAVEDBY#`, `PLACES#<locality>`, `PLACESLUG#<locality>#<slug>` in `apps/api/src/persistence/keys.ts`
- [ ] T004 [P] Add the item-type discriminators (`conversation`, `conversation-participant`, `message`, `place`, `place-post-index`, `place-follow`, `saved-post`) alongside the existing ones in `apps/api/src/persistence/keys.ts`
- [ ] T005 Register the long-poll divergence (research R1 — a hosted deployment will not hold HTTP connections; a green local chat suite is not evidence for a hosted transport) in `docs/verification/divergence-register.md` 🔒
- [ ] T006 [P] Add a script that produces a real, short H.264 test video at `apps/e2e/fixtures/sample.mp4` via the `linuxserver/ffmpeg` container, in `apps/e2e/scripts/make-video-fixture.mjs`. `apt-get install ffmpeg` does not work here
- [ ] T007 [P] Add a script that writes a JPEG carrying real EXIF GPS tags to `apps/e2e/fixtures/with-gps.jpg`, in `apps/e2e/scripts/make-exif-fixture.mjs`. SC-008 is worthless without a file that actually has coordinates in it
- [ ] T008 [P] Add a place fixture set with near-duplicate names in one locality and identical names across localities, in `apps/e2e/support/places.ts` — SC-007 measures against this set
- [ ] T009 Verify the table recreates cleanly from empty: `docker compose down -v && docker compose up -d && pnpm verify:local`. DynamoDB Local needs `user: root` on its volume or it answers 400 to a bare GET, passes the health probe, and hangs every real request forever

**Checkpoint**: the table has five indexes, the keys compile, and the fixtures exist.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the two contract tests and the five repositories. **No user story may start
until this phase is complete** — the boundaries have to exist before anything reads through
them, for the same reason 001 put T044–T048 in front of every read path.

**⚠️ The two contract tests below MUST be written first and MUST fail.**

- [ ] T010 Add the four new surfaces — place page, saved posts, post shared into a conversation, in-interest search — to the `SURFACES` array in `apps/api/tests/visibility/matrix.spec.ts` with `built: false`, so they report as skipped rather than as covered 🔒
- [ ] T011 Extend the SC-009 reporter in `apps/api/tests/visibility/matrix.spec.ts` to print `assertionsRun / 462` and name every unbuilt surface, so a skipped surface can never be mistaken for a passing one 🔒
- [ ] T012 [P] Write the `ConversationAccess` decision-table test — 6 conversation states × 5 viewer relationships × 2 operations = **60 generated assertions**, from `contracts/visibility-matrix-addendum.md` Part 2 — in `apps/api/tests/unit/conversation-access.spec.ts`. **Must fail: the module does not exist**
- [ ] T013 Create the single conversation-membership boundary at `apps/api/src/conversations/conversation-access.ts`. **Top level, not under `modules/`** — for the same reason `VisibilityFilter` is top level (001/D6): a boundary that lives inside its consumer becomes a helper, and a helper gets inlined
- [ ] T014 Create `apps/api/src/conversations/conversation-access.module.ts` and export the provider token
- [ ] T015 [P] Create `ConversationRepository` (meta item + both participant rows in one `TransactWriteItems`) in `apps/api/src/persistence/conversation.repository.ts`
- [ ] T016 [P] Create `MessageRepository` (append with ULID sort key, cursor query) in `apps/api/src/persistence/message.repository.ts`
- [ ] T017 [P] Create `PlaceRepository` (meta item, GSI1 slug lookup, GSI3 locality listing) in `apps/api/src/persistence/place.repository.ts`
- [ ] T018 [P] Create `PlaceFollowRepository` (GSI4 inverted for follower counts) in `apps/api/src/persistence/place-follow.repository.ts`
- [ ] T019 [P] Create `SavedPostRepository` (`SAVE#<savedAt>#<postId>` list row plus `SAVEDBY#<postId>` point-read row) in `apps/api/src/persistence/saved-post.repository.ts`
- [ ] T020 [P] Create `PostPlaceIndexRepository` (`pk = PLACE#<id>`, `sk = POST#<createdAt>#<postId>`, denormalising `visibility`, `processingState`, `authorId`) in `apps/api/src/persistence/post-place-index.repository.ts`
- [ ] T021 Register all six new repositories in `apps/api/src/persistence/persistence.module.ts`
- [ ] T022 [P] Add `message`, `place`, and `interest-description` as report subject types in `apps/api/src/modules/safety/` and the moderation queue in `apps/api/src/modules/moderation/`
- [ ] T023 [P] Add `notificationPrefs` to the Person item and `PersonRepository` in `apps/api/src/persistence/person.repository.ts`. **Absent means on**, so no backfill is needed
- [ ] T024 [P] Add the 004 entity types (`Conversation`, `Message`, `Place`, `PlaceCategory`, `NotificationPreferences`) to `packages/shared/src/types/entities.ts`
- [ ] T025 [P] Add a `wait` (long-poll) helper to the durable event bus surface — a promise resolving on a named event or a timeout — in `apps/api/src/adapters/local/durable-event-bus.ts`. Subscribe from `onApplicationBootstrap`, never `onModuleInit`: Nest fires the latter before subscribers register, and 003 lost events to exactly that
- [ ] T026 Add the fifth tab (`Chats`) and the seven new routes (`conversations`, `conversation`, `place`, `create-place`, `saved`, `people-search`, `notification-settings`) to the `Tab` and `Route` unions in `apps/mobile/src/App.tsx` 🔒
- [ ] T027 Checkpoint: `pnpm typecheck && pnpm lint` clean; `pnpm test:visibility` reports **294/462 assertions, 4 surfaces not yet built**; `conversation-access.spec.ts` passes with 60 assertions

**Checkpoint**: both boundaries exist, both are enforced by generated tables, and every
story below can start in parallel.

---

## Phase 3: User Story 1 — Two people can talk (Priority: P1) 🎯 MVP

**Goal**: two people can hold a persistent one-to-one conversation, an unsolicited first
message lands in Requests and notifies nobody, and a block severs the thread both ways.

**Independent test**: `pnpm --filter @sih/e2e test -- conversations` — two seeded identities,
a message sent by one and read by the other over HTTP; a third identity's first message in
Requests; a block making the thread unreadable from both sides. Passes with no other story
in this feature built.

**⚠️ Release gate (Constitution IV)**: this story does not ship without message reporting,
the request inbox, and block severance. They are tasks in this phase, not a later one.

### Tests for User Story 1

- [ ] T028 [P] [US1] Write the conversation journeys — send/read, long-poll latency, request inbox, accept, decline, block both ways, shared-post resolution, report — in `apps/e2e/journeys/conversations.spec.ts`. **Must fail**
- [ ] T029 [P] [US1] Write the SC-002 durability spec — restart the API and DynamoDB Local, assert no message lost and no ordering change — in `apps/e2e/durability/conversations.spec.ts`
- [ ] T030 [P] [US1] Write the FR-012 negative test: a conversation between two people changes neither the contents nor the order of any feed, interest space, place page, or profile, in `apps/api/tests/integration/chat-does-not-widen.spec.ts`

### Implementation for User Story 1

- [ ] T031 [US1] Implement the derived conversation id — a hash of the two person ids sorted — with its unit test in `apps/api/src/modules/conversations/conversation-id.ts`. This is what makes opening a conversation idempotent with no uniqueness item and no race (research R8)
- [ ] T032 [US1] Implement `ConversationService.open` (idempotent; returns the existing thread) in `apps/api/src/modules/conversations/conversation.service.ts`
- [ ] T033 [US1] Implement inbox listing split by state over GSI5 — accepted and requested are one query each, not one query and a filter — in `apps/api/src/modules/conversations/conversation.service.ts`
- [ ] T034 [US1] Implement `ConversationService.send`: the message plus both participant rows in one `TransactWriteItems`, updating `lastMessageAt`, `unreadCount` and `lastMessagePreview`, in `apps/api/src/modules/conversations/conversation.service.ts`
- [ ] T035 [US1] Enforce the request rules on send — at most one unanswered message while `requested` (409), silent discard while `declined` (202), refusal while `severed` (404) — in `apps/api/src/modules/conversations/conversation.service.ts`
- [ ] T036 [US1] Emit `message.created` on the durable event bus after a successful send, in `apps/api/src/modules/conversations/conversation.service.ts`
- [ ] T037 [US1] Implement the long-poll message read: return immediately if anything is newer than the cursor, otherwise await `message.created` for this conversation for up to 25 s and return an empty page on timeout, in `apps/api/src/modules/conversations/message-poll.service.ts`
- [ ] T038 [US1] Implement accept / decline / read-position handlers (meta item plus both participant rows, one transaction) in `apps/api/src/modules/conversations/conversation.service.ts`
- [ ] T039 [US1] Resolve each message's `sharedPostId` per reader **through `VisibilityFilter`**, returning the message with `sharedPost: null` and `sharedPostUnavailableReason` when excluded, in `apps/api/src/modules/conversations/message-presenter.ts`. Never denormalise a snapshot of the post — that is a materialised copy outliving a visibility change
- [ ] T040 [US1] Flip **surface 10** (post shared into a conversation) to `built: true` in `apps/api/tests/visibility/matrix.spec.ts` and make its 42 assertions pass 🔒
- [ ] T041 [US1] Sever conversations in both directions from the existing block path in `apps/api/src/modules/safety/`, and make every refusal a `404` indistinguishable from non-existence
- [ ] T042 [US1] Suppress notifications for `requested` conversations and create them for `accepted` ones, in `apps/api/src/modules/notifications/`
- [ ] T043 [US1] Add message reporting to the existing queue and audit log, and make a `removed` message withhold its body while leaving the thread readable, in `apps/api/src/modules/moderation/`
- [ ] T044 [US1] Rate-limit sending per sender and per recipient, reusing the existing publish/comment limiter, in `apps/api/src/modules/conversations/conversation.controller.ts`
- [ ] T045 [US1] Implement all seven conversation endpoints per `contracts/openapi.yaml` in `apps/api/src/modules/conversations/conversation.controller.ts`, with every access decision delegated to `ConversationAccess`
- [ ] T046 [US1] Register `ConversationsModule` in `apps/api/src/app.module.ts`

### Mobile for User Story 1

- [ ] T047 [P] [US1] Create the conversations data layer — inbox, open, messages with `wait`, send, accept, decline, read — in `apps/mobile/src/data/conversations.ts`. **No react-native imports below this file**; `apps/e2e` drives these exact modules in Node
- [ ] T048 [US1] Register `ConversationsData` on `AppData` in `apps/mobile/src/data/index.ts` 🔒
- [ ] T049 [P] [US1] Build `InboxScreen` with an Accepted/Requests segmented control, unread counts, and an empty state, in `apps/mobile/src/features/conversations/InboxScreen.tsx`
- [ ] T050 [P] [US1] Build `ConversationScreen` with a long-poll loop that stops on blur and resumes on focus, in `apps/mobile/src/features/conversations/ConversationScreen.tsx`
- [ ] T051 [P] [US1] Build `SharedPostBubble` rendering an unavailable shared post as "not available to you" / "no longer available" rather than an empty bubble, in `apps/mobile/src/features/conversations/SharedPostBubble.tsx`
- [ ] T052 [US1] Add `InboxContainer` and `ConversationContainer` in `apps/mobile/src/screens/index.tsx`, loading real data and wiring every callback. **No `() => undefined`** — that exact placeholder is why the follow button, the comment sheet and the report action were all unreachable on device 🔒
- [ ] T053 [US1] Mount the Chats tab and the conversation route in `apps/mobile/src/App.tsx`, and add a "Message" action to `ProfileScreen` so a conversation is reachable from the app's own entry points 🔒
- [ ] T054 [US1] Add "Send to a conversation" to `apps/mobile/src/features/engagement/ShareAction.tsx`

### Device verification for User Story 1

- [ ] T055 [P] [US1] Write `.maestro/13-send-message.yaml`: Chats tab → conversation → send → assert the message through `GET /v1/conversations/{id}/messages`, not through the view hierarchy
- [ ] T056 [P] [US1] Write `.maestro/14-message-request.yaml`: a stranger's first message appears under Requests and produces no notification
- [ ] T057 [US1] Run `node scripts/verify-maestro-ids.mjs` and add any missing `testID`s to the new screens
- [ ] T058 [US1] Checkpoint: `pnpm --filter @sih/e2e test -- conversations` green; `test:visibility` reports **336/462, 3 surfaces unbuilt**; SC-001 measured under 2 s and SC-003 measured at zero

**Checkpoint**: chat works end to end, with its safety controls, and nothing else in this
feature is required for it.

---

## Phase 4: User Story 2 — A post can be about a place (Priority: P1)

**Goal**: a post can be attached to a restaurant; the restaurant has a page; a second person
finds it by name instead of creating a duplicate; and following it does not widen anyone's
feed.

**Independent test**: `pnpm --filter @sih/e2e test -- places` — create, attach, publish, open
the place page as a stranger and signed out, follow it without following its interest and
assert the post never reaches the feed.

### Tests for User Story 2

- [ ] T059 [P] [US2] Write the place journeys — dedupe-before-create, attach, place page as stranger and anonymous, follow, merge — in `apps/e2e/journeys/places.spec.ts`. **Must fail**
- [ ] T060 [P] [US2] Write the **SC-006** negative test in two halves in `apps/api/tests/integration/place-follow-does-not-widen.spec.ts`: first show the post **does** reach the feed when the interest is followed, then unfollow the interest and show it does not. A one-half version passes for the wrong reason whenever paging or an empty candidate set hides the post
- [ ] T061 [P] [US2] Write the **SC-008** hostile-client test in `apps/api/tests/integration/place-never-inferred.spec.ts`: publish `apps/e2e/fixtures/with-gps.jpg` through the raw HTTP path a modified client would use and assert the result carries no place and none was suggested
- [ ] T062 [P] [US2] Write the **SC-007** dedupe measurement over `apps/e2e/support/places.ts` in `apps/api/tests/integration/place-dedupe.spec.ts`

### Implementation for User Story 2

- [ ] T063 [US2] Implement place creation with slug uniqueness per locality, returning `409` **with the existing place body** so the client attaches it instead of creating a duplicate, in `apps/api/src/modules/places/place.service.ts`
- [ ] T064 [US2] Implement place name search behind the existing `CatalogueSearch` interface, locality-scoped, with a GSI3 prefix query beyond the cached set, in `apps/api/src/modules/places/place-catalogue.service.ts`
- [ ] T065 [US2] Add `placeId` to the publish DTO and validate it server-side (exists, `active`, at most one) in `apps/api/src/modules/posts/post.controller.ts`
- [ ] T066 [US2] Widen the **publish** transaction to write the place index item alongside the post and its interest index items in `apps/api/src/persistence/post.repository.ts` 🔒
- [ ] T067 [US2] Widen the **visibility-change** transaction (001/FR-017) to update the place index item's denormalised `visibility` and `processingState` in `apps/api/src/persistence/post.repository.ts` 🔒
- [ ] T068 [US2] Widen the **edit/refile** transaction to move or delete the place index item when `placeId` changes or is nulled, in `apps/api/src/persistence/post.repository.ts` 🔒
- [ ] T069 [US2] Add an explicit guard asserting no write path may populate `placeId` from media metadata, in `apps/api/src/modules/media/` — 001/FR-010 strips location and this attaches it, and the two must never meet (FR-021)
- [ ] T070 [US2] Implement the place-page posts query — one `Query` on the place partition, handed to `VisibilityFilter` like any other candidate set — in `apps/api/src/modules/places/place-posts.service.ts`
- [ ] T071 [US2] Flip **surface 8** (place page) to `built: true` in `apps/api/tests/visibility/matrix.spec.ts` and make its 42 assertions pass 🔒
- [ ] T072 [US2] Implement place follow and unfollow with the GSI4 inverted follower count, in `apps/api/src/modules/places/place-follow.service.ts`
- [ ] T073 [US2] Assert, in `apps/api/src/modules/feed/feed.service.ts`, that candidate assembly reads interest follows only and **never** `PlaceFollowRepository` — add the comment saying why at the call site, because the item existing is exactly what tempts a later change to consult it
- [ ] T074 [US2] Implement place reporting, rename, merge and retire, carrying posts and followers across without orphaning content, in `apps/api/src/modules/moderation/place-admin.controller.ts`
- [ ] T075 [US2] Implement the place endpoints per `contracts/openapi.yaml` in `apps/api/src/modules/places/place.controller.ts`, and register `PlacesModule` in `apps/api/src/app.module.ts`
- [ ] T076 [US2] Add `place` to post responses, hydrated from the place record — **the full response shape, not `VisibilityFilter`'s candidate rows.** That defect has shipped five times in this repository — in `apps/api/src/modules/posts/post-query.service.ts`

### Mobile for User Story 2

- [ ] T077 [P] [US2] Create the places data layer — search, create, get, posts, follow, unfollow — in `apps/mobile/src/data/places.ts`
- [ ] T078 [US2] Register `PlacesData` on `AppData` in `apps/mobile/src/data/index.ts` 🔒
- [ ] T079 [P] [US2] Build `PlacePicker` (type-ahead, existing matches above the create action) in `apps/mobile/src/features/places/PlacePicker.tsx`
- [ ] T080 [P] [US2] Build `CreatePlaceScreen` (name, category, locality, optional address) in `apps/mobile/src/features/places/CreatePlaceScreen.tsx`
- [ ] T081 [P] [US2] Build `PlaceScreen` (header, category, locality, interests, follow button, posts, empty state) in `apps/mobile/src/features/places/PlaceScreen.tsx`
- [ ] T082 [US2] Add the optional place step to compose in `apps/mobile/src/features/publish/ComposeScreen.tsx` — optional means skippable, and a post with no place must behave exactly as it does today
- [ ] T083 [US2] Add a tappable place chip to `apps/mobile/src/features/posts/PostDetailScreen.tsx` and the feed card in `apps/mobile/src/features/feed/HomeFeedScreen.tsx`
- [ ] T084 [US2] Add `PlaceContainer` and `CreatePlaceContainer` in `apps/mobile/src/screens/index.tsx` and mount their routes in `apps/mobile/src/App.tsx` 🔒
- [ ] T085 [US2] Extend Discover so one search covers interests **and** places, in `apps/mobile/src/features/discover/InterestSearchScreen.tsx`

### Device verification for User Story 2

- [ ] T086 [P] [US2] Write `.maestro/15-attach-place.yaml`: compose → place picker → publish → assert the post through `GET /v1/places/{id}/posts`
- [ ] T087 [P] [US2] Write `.maestro/16-place-page.yaml`: post → place chip → place page → follow
- [ ] T088 [US2] Checkpoint: `pnpm --filter @sih/e2e test -- places` green; `test:visibility` reports **378/462, 2 surfaces unbuilt**; SC-006, SC-007 and SC-008 all measured

**Checkpoint**: places work end to end and Principle I is enforced by a test rather than by
an intention.

---

## Phase 5: User Story 3 — An interest page is worth opening (Priority: P2)

**Goal**: an interest page shows what the interest is, how big it is, what is under it, and
lets you sort and search within it.

**Independent test**: `pnpm --filter @sih/e2e test -- interest-depth` against the existing
interest fixtures. No dependency on US1 or US2.

### Tests for User Story 3

- [ ] T089 [P] [US3] Write the interest-depth journeys in `apps/e2e/journeys/interest-depth.spec.ts`. **Must fail**
- [ ] T090 [P] [US3] Write the **SC-009** test asserting `order=new` and `order=top` return **identical id sets** — compare sets across all pages, not first pages — in `apps/api/tests/integration/interest-order.spec.ts`

### Implementation for User Story 3

- [ ] T091 [P] [US3] Add `description` and `descriptionUpdatedAt` to the Interest item and `InterestRepository` in `apps/api/src/persistence/interest.repository.ts`
- [ ] T092 [US3] Implement `PUT /interests/{id}/description` with its permission rules — operators for a top-level interest, creator or operator for a sub-interest — in `apps/api/src/modules/interests/interest.controller.ts`
- [ ] T093 [US3] Make interest descriptions reportable as `interest-description` in `apps/api/src/modules/safety/safety.controller.ts`
- [ ] T094 [US3] Implement `order=top` by reordering the candidate set the recency query already produced, **after** `VisibilityFilter`, reusing `apps/api/src/modules/feed/ranking.ts` — no second query, in `apps/api/src/modules/interests/interest-posts.controller.ts`
- [ ] T095 [US3] Implement in-interest post search, matching **after** filtering so a caption cannot leak through a count, in `apps/api/src/modules/interests/interest-posts.controller.ts`
- [ ] T096 [US3] Flip **surface 11** (in-interest search) to `built: true` in `apps/api/tests/visibility/matrix.spec.ts` and make its 42 assertions pass 🔒
- [ ] T097 [US3] Add follower count and the sub-interest list to the interest response in `apps/api/src/modules/interests/interest.controller.ts`

### Mobile for User Story 3

- [ ] T098 [P] [US3] Extend `apps/mobile/src/data/interests.ts` with `description`, `order`, and in-interest `q`
- [ ] T099 [US3] Render description, follower count and a sub-interest grid in `apps/mobile/src/features/discover/InterestScreen.tsx`
- [ ] T100 [US3] Add the New/Top control and the in-interest search field to `apps/mobile/src/features/discover/InterestScreen.tsx`, wired through `InterestContainer` in `apps/mobile/src/screens/index.tsx` 🔒
- [ ] T101 [US3] Add "Report this description" to `apps/mobile/src/features/safety/SafetyActions.tsx`
- [ ] T102 [US3] Checkpoint: `test:visibility` reports **420/462, 1 surface unbuilt**; SC-009 measured on id sets

---

## Phase 6: User Story 4 — Close the holes in what already shipped (Priority: P2)

**Goal**: deliver 001/FR-049, which has no implementation at all; make people searchable;
and exercise the video path for the first time.

**Independent test**: three independent verifications, none depending on another story.

### Tests for User Story 4

- [ ] T103 [P] [US4] Write the notification-preference test asserting **zero rows are written** for a suppressed category and that other categories are unaffected, in `apps/api/tests/integration/notification-preferences.spec.ts`. "Filtered from the list" is not what FR-031 says and is not what this asserts. **Must fail**
- [ ] T104 [P] [US4] Write the people-search journeys, including blocks in both directions and non-active people, in `apps/e2e/journeys/people-search.spec.ts`. **Must fail**

### Implementation for User Story 4

- [ ] T105 [US4] Implement `PUT /me/notification-preferences` in `apps/api/src/modules/people/me.controller.ts` and return the current preferences from `GET /me`
- [ ] T106 [US4] Enforce preferences **at creation** in `apps/api/src/modules/notifications/notification.service.ts` — the suppressed notification is never written, so no other reader (a digest, a badge count, a push sender, an export) can surface it (research R10)
- [ ] T107 [US4] Wire the `message` category to the conversation notifications from T042 in `apps/api/src/modules/notifications/notification.service.ts`
- [ ] T108 [US4] Implement `GET /people?q=` over a GSI1 handle/display-name prefix query in `apps/api/src/modules/people/person.controller.ts`
- [ ] T109 [US4] Exclude people blocked in **either** direction and any non-active person, server-side, and test it through the path a modified client would take, in `apps/api/src/modules/people/person-search.service.ts`
- [ ] T110 [P] [US4] Extend `apps/mobile/src/data/notifications.ts` with preference read and write, and add `PeopleData.search` to `apps/mobile/src/data/people.ts`; register any new module in `apps/mobile/src/data/index.ts` 🔒
- [ ] T111 [US4] Build `NotificationSettingsScreen` in `apps/mobile/src/features/notifications/NotificationSettingsScreen.tsx`, add its container in `apps/mobile/src/screens/index.tsx`, and mount its route from the profile tab in `apps/mobile/src/App.tsx` 🔒
- [ ] T112 [US4] Add people results to Discover search in `apps/mobile/src/features/discover/InterestSearchScreen.tsx`

### Video — the first time this path has ever run

- [ ] T113 [US4] Point `apps/e2e/journeys/publish-video.spec.ts` at the real `apps/e2e/fixtures/sample.mp4` from T006 and assert transcode completion and a poster frame, rather than a stubbed media record
- [ ] T114 [US4] Assert the poster frame is a real decoded image using the PNG/JPEG decoder in `scripts/assert-screen-not-blank.mjs`, in `apps/e2e/journeys/publish-video.spec.ts`
- [ ] T115 [P] [US4] Write `.maestro/19-publish-video.yaml`: publish a video and assert playback started, for **SC-011**
- [ ] T116 [P] [US4] Write `.maestro/18-notification-settings.yaml`: turn reactions off, have another identity react, assert no notification arrives
- [ ] T117 [US4] Checkpoint: SC-010 and SC-012 measured. **SC-011 remains unverified until an emulator run exists** and must be reported that way — 001/FR-005 and 001/FR-009 have been claimed once already without a run behind them

---

## Phase 7: User Story 5 — Save a post to come back to (Priority: P3)

**Goal**: save a post, find it again, and never see one you are no longer allowed to see.

**Independent test**: `pnpm --filter @sih/e2e test -- saved`.

### Tests for User Story 5

- [ ] T118 [P] [US5] Write the saved-post journeys, including the **SC-013** case where the saved post's visibility later excludes the saver, in `apps/e2e/journeys/saved.spec.ts`. **Must fail**

### Implementation for User Story 5

- [ ] T119 [US5] Implement save and unsave, refusing a post the caller cannot currently see, in `apps/api/src/modules/saved/saved.service.ts`
- [ ] T120 [US5] Implement `GET /me/saved`, handing the saved rows to `VisibilityFilter` as a candidate set and returning full post responses, in `apps/api/src/modules/saved/saved.controller.ts`. A save is a bookmark, not a copy
- [ ] T121 [US5] Register `SavedModule` in `apps/api/src/app.module.ts` and add `viewerHasSaved` to post responses in `apps/api/src/modules/posts/post-query.service.ts`
- [ ] T122 [US5] Flip **surface 9** (saved posts) to `built: true` in `apps/api/tests/visibility/matrix.spec.ts` and make its 42 assertions pass 🔒
- [ ] T123 [P] [US5] Create the saved data layer in `apps/mobile/src/data/saved.ts` and register it in `apps/mobile/src/data/index.ts` 🔒
- [ ] T124 [US5] Add a save action to `apps/mobile/src/features/engagement/EngagementBar.tsx`
- [ ] T125 [US5] Build `SavedScreen` in `apps/mobile/src/features/profile/SavedScreen.tsx`, add its container in `apps/mobile/src/screens/index.tsx`, and reach it from the profile tab in `apps/mobile/src/App.tsx` 🔒
- [ ] T126 [P] [US5] Write `.maestro/17-saved.yaml`: post → save → profile → saved list
- [ ] T127 [US5] Checkpoint: `test:visibility` reports **462/462, 0 surfaces unbuilt** — SC-005 closed

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T128 Assert the matrix runs **462 assertions with zero skipped surfaces** and fail the suite if any surface is unbuilt, in `apps/api/tests/visibility/matrix.spec.ts` 🔒
- [ ] T129 Merge `specs/004-chat-places-and-depth/contracts/openapi.yaml` into `specs/001-interest-media-sharing/contracts/openapi.yaml` as one document
- [ ] T130 Regenerate the shared client from the merged contract: `pnpm --filter @sih/shared generate:client`, then confirm the generated shapes match what the server actually accepts. **A generated client and a server generated from one document agree by construction and prove nothing** — 002 found the publish body mismatch only by making a request
- [ ] T131 [P] Add empty states following the 001/FR-036 shape to `apps/mobile/src/features/conversations/InboxScreen.tsx` (both inboxes), `apps/mobile/src/features/places/PlaceScreen.tsx`, and `apps/mobile/src/features/profile/SavedScreen.tsx`
- [ ] T132 [P] Verify rate limits cover every new write path — send, place create, save — in `apps/api/tests/integration/rate-limits.spec.ts`
- [ ] T133 Assert the long-poll's **request count**, not only its latency, in `apps/e2e/journeys/conversations.spec.ts`. If the handler fails to await the event bus, the latency assertion still passes at small scale and the load characteristic is silently wrong
- [ ] T134 Finalise the long-poll divergence entry and run `pnpm verify:register` in `docs/verification/divergence-register.md` 🔒
- [ ] T135 [P] Add a `bench:chat` harness measuring held connections and message latency under concurrency in `apps/api/bench/chat.ts`, reusing `apps/api/bench/harness.ts`. Drain child stderr and kill the process group, not just `npx` — both cost a 22-minute hang before
- [ ] T136 [P] Update `CLAUDE.md` with what 004 established, what it did not, and any decision that turned out wrong
- [ ] T137 Run the **real CI step list**, not a proxy for it: `pnpm typecheck && pnpm lint && pnpm test && pnpm verify:local && pnpm --filter @sih/e2e test`. Two red builds came from assuming typecheck/lint/tests covered CI
- [ ] T138 Dispatch `.github/workflows/android-emulator.yml` — **requires the owner's explicit approval**, since it spends the account's Actions allowance. Not an implicit part of any task
- [ ] T139 Write the run record at `docs/verification/runs/<date>-journey-run-004.md`, with per-journey service-side evidence and an explicit `not run` for anything not executed
- [ ] T140 Report SC-002, SC-011 and the concurrency criteria **honestly** in the completion summary: met, unverified, or unmeasured — never "should work"

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: no dependencies
- **Phase 2 (Foundational)**: depends on Phase 1. **Blocks every user story** — the two
  boundaries must exist before anything reads through them
- **Phases 3–7 (Stories)**: all depend on Phase 2, and are otherwise independent
- **Phase 8 (Polish)**: depends on the stories you intend to ship

### User story dependencies

Genuinely independent, with two soft edges:

- **US1** — none.
- **US2** — none. Touches `post.repository.ts`, which no other story in this feature writes.
- **US3** — none.
- **US4** — T107 (the `message` notification category) is the only cross-story task; it is a
  no-op until US1's T042 exists, so US4 is completable without US1 and that one task is
  skipped until it is.
- **US5** — none.

### Within each story

Contract tests → repositories → services → endpoints → data layer → screens → containers and
routes → Maestro. **Never stop at the screen.** Four defects in this codebase were a screen
that worked and nothing that called it, each passing its own unit test.

### Parallel opportunities

- Phase 1: T002–T008 all `[P]`
- Phase 2: T015–T020 (six repositories, six files) and T022–T025 all `[P]`
- After Phase 2, all five stories can run concurrently — subject to the single-owner table
- Within each story, every `[P]` test task and every `[P]` screen file

---

## Parallel Example: Phase 2

```bash
# Six repositories, six files, no shared state:
Task: "Create ConversationRepository in apps/api/src/persistence/conversation.repository.ts"
Task: "Create MessageRepository in apps/api/src/persistence/message.repository.ts"
Task: "Create PlaceRepository in apps/api/src/persistence/place.repository.ts"
Task: "Create PlaceFollowRepository in apps/api/src/persistence/place-follow.repository.ts"
Task: "Create SavedPostRepository in apps/api/src/persistence/saved-post.repository.ts"
Task: "Create PostPlaceIndexRepository in apps/api/src/persistence/post-place-index.repository.ts"
```

## Parallel Example: User Story 1 screens

```bash
Task: "Build InboxScreen in apps/mobile/src/features/conversations/InboxScreen.tsx"
Task: "Build ConversationScreen in apps/mobile/src/features/conversations/ConversationScreen.tsx"
Task: "Build SharedPostBubble in apps/mobile/src/features/conversations/SharedPostBubble.tsx"
```

---

## Implementation Strategy

### MVP: Phases 1, 2, 3 — chat, with its safety controls

1. Phase 1 (Setup) — T001–T009
2. Phase 2 (Foundational) — T010–T027. **Blocks everything**
3. Phase 3 (US1) — T028–T058
4. **STOP and validate**: `pnpm --filter @sih/e2e test -- conversations`, then the two
   Maestro flows on the emulator
5. That is 58 tasks and a shippable increment. It does **not** ship without T041 (block
   severance), T042 (request-inbox notification suppression) and T043 (message reporting) —
   Constitution IV makes those part of the story, not a follow-on

### Incremental delivery

Setup + Foundational → US1 (chat, MVP) → US2 (places) → US3 (interest depth) →
US4 (the shipped-scope holes) → US5 (saved). Each adds value without breaking the last, and
each closes its own success criteria.

**If you want the cheapest visible win first**, US4's notification preferences (T103, T105,
T106, T111) is roughly four tasks and closes a promise the product currently breaks by
omission. It is P2 because chat and places are what the owner asked for, not because it is
hard.

### Parallel team strategy

Per the repository's own guidance: **3–5 agents, 5–6 tasks each, `isolation: "worktree"`.**
After Phase 2, US1/US2/US3/US4/US5 are five lanes. The single-owner table above is the
constraint that makes that safe — assign `App.tsx`, `screens/index.tsx`,
`matrix.spec.ts`, `post.repository.ts`, `data/index.ts` and the divergence register to one
owner each and serialise their tasks.

Agent Teams needs an interactive session and is not usable in the cloud web environment;
use subagents or the Workflow tool here.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task
- 🔒 = single-owner file; see the table at the top
- Verify a contract test fails before implementing what it governs
- Commit after each task or logical group; nothing in this sandbox survives a reset
- The two owner gates (G1 datastore, G2 scope) are in [plan.md](./plan.md) and are unresolved
- Report unverified things as unverified. SC-002 needs a restart, SC-011 needs a device run,
  and the concurrency criteria need spend that has not been approved
