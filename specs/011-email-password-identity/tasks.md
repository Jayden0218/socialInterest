---

description: "Task list for 011 — Email and Password Identity"
---

# Tasks: Email and Password Identity

**Input**: Design documents from `specs/011-email-password-identity/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: **Included, and not optional.** `contracts/identity.md` declares itself a
contract, and the constitution requires the test enforcing one to exist before the
implementation it governs. Two of its guarantees — refusal timing and uniqueness under
concurrency — are satisfied by the wrong implementation in any test somebody would write
naturally, which is precisely why they are written first and watched fail.

**Organization**: by user story, so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependencies)
- **[Story]**: which user story this serves

---

## The sequencing decision that is not a preference

**Phase 2 comes before every user story because US1 is the first thing that lets a human
choose a handle**, and research R1 established — by running it, not by reading it — that
handles are not unique today and a duplicate **shadows** the original across thirteen call
sites in six services.

Building sign-up first and adding uniqueness afterwards would mean the window in which the
defect is reachable is exactly the window in which the feature is new and being used.

**And uniqueness covers the WHOLE set, not the rows this feature writes.** A claim record
defends only the handles that carry one. Accounts predating this feature carry none, so
without T007 the first human ever to choose a handle could take one already in use — R1's
defect reintroduced by R1's own fix.

---

## Phase 1: Setup

- [ ] T001 Add the three key builders to `apps/api/src/persistence/keys.ts` — credential by email, handle claim, reset request — following the existing naming and leaving every current builder untouched
- [ ] T002 [P] Add `PASSWORD_MIN_LENGTH = 10` to `apps/api/src/modules/auth/constants.ts` with the reasoning from Assumptions beside it, so the floor is one editable place rather than a literal in a validator

**Checkpoint**: keys exist. Nothing uses them.

---

## Phase 2: Foundational — handle uniqueness (BLOCKING, and a defect fix)

**⚠️ No user story work begins until T003–T008 are done.**

- [ ] T003 Write `apps/api/tests/integration/handle-uniqueness.spec.ts` asserting that two people cannot hold one handle, driven under **genuine concurrency** rather than in sequence
- [ ] T004 **Run T003 against the product as it stands and watch it FAIL.** Record the output in `docs/verification/011-guard-red-log.md`, the way 008 recorded its red runs — not in `checklists/`, which is the spec-quality checklist and not a verification log. Research R1 predicts a specific failure — the second create succeeds and `findByHandle` returns the *second* person — and a different failure means the analysis is wrong, not the test
- [ ] T005 Implement `apps/api/src/persistence/handle-claim.repository.ts`: claim a handle with the conditional write that makes the claim atomic, and release one
- [ ] T006 **Measure** that no two existing handles already collide, with a one-off check over the datastore. The property is believed to hold because every handle in existence carries a generated suffix, and that is an argument rather than a measurement. **If it does not hold, stop** — a collision is for a person to resolve, and a script choosing which account keeps its name is R1's wrong-person outcome performed deliberately
- [ ] T007 **Back-fill a claim row for every handle that already exists**, in one bounded pass, gated on T006 passing. Without this the constraint defends only handles chosen from here on, and the first human to pick one could take an existing person's. **No existing handle is renamed** — claiming and renaming are different operations and the first version of R1 conflated them
- [ ] T008 Run T003 and watch it pass, then **break the claim's condition and watch it fail again** — a conditional write that has only ever succeeded is indistinguishable from an unconditional one

**Checkpoint**: a handle can be claimed once, across the whole set. No account can be created yet.

---

## Phase 3: User Story 1 — Create an account (Priority: P1) 🎯 MVP

**Goal**: a person creates an account in the app and reaches the cold start.

**Independent Test**: install on a device that has never signed in, create an account, reach
the feed, and never be shown a token or a server address.

### Tests first — the two that cannot be added later

- [ ] T009 [P] [US1] Write `apps/api/tests/integration/auth-signup-concurrency.spec.ts`: N simultaneous sign-ups for one email address produce **exactly one** account (SC-005, contract §1). A sequential version of this proves nothing
- [ ] T010 [P] [US1] Write `apps/api/tests/unit/password.spec.ts`: derivation produces a different result for the same password twice (a salt is present), verification accepts the right password and rejects the wrong one, and comparison is constant-time

### Implementation

- [ ] T011 [US1] Implement `apps/api/src/modules/auth/password.ts` — `scrypt` derivation with a per-password salt, **parameters stored alongside the hash** so the choice stays reversible, and `timingSafeEqual` comparison (research R2)
- [ ] T012 [US1] Implement `apps/api/src/persistence/credential.repository.ts` — partitioned by the folded email address, per [data-model.md](./data-model.md)
- [ ] T013 [US1] Implement sign-up in `apps/api/src/modules/auth/auth.service.ts` writing the credential, the handle claim and the person in **one transaction**. All or none: a person without their claim frees the handle for somebody else, and a claim without the person burns a handle nobody can use
- [ ] T014 [US1] Add `POST /v1/auth/sign-up` to `apps/api/src/modules/auth/auth.controller.ts`, marked `@Public()` and rate limited
- [ ] T015 [US1] Extend `apps/api/src/adapters/local/local-identity-provider.ts` to issue a credential for a person, leaving `issueForTesting` exactly as it is — a test affordance that must stay distinguishable from the product path
- [ ] T016 [US1] Register the module in `apps/api/src/app.module.ts` and its repositories in `apps/api/src/persistence/persistence.module.ts` — the **base** position, not `OVERLAY_MODULES`, per the plan's Structure Decision. Identity is the floor under the whole product, not a fork's own feature, and the conflict this buys at the next sync is bought deliberately
- [ ] T017 [US1] Fold and trim the email address on the way in, so `Jo@Example.com ` and `jo@example.com` are one address for uniqueness and for sign-in (FR-004)

### The app

- [ ] T018 [P] [US1] Add `signUp` to `apps/mobile/src/data/session.ts` beside the existing `signIn`/`signOut`
- [ ] T019 [US1] Build `apps/mobile/src/features/auth/SignUpScreen.tsx` — email, password, handle, display name. **The submit stays ABOVE the fields**: runs 39–41 were spent signed out because a submit fell below the fold once the keyboard opened, on a screen that does not scroll, and a control above the fields cannot be covered by a keyboard that opens below them at any keyboard height
- [ ] T020 [US1] Build `apps/mobile/src/screens/SignUpContainer.tsx`, with every hook above every return per `hooks-before-return.test.ts`
- [ ] T021 [US1] Show the password floor **before** submission rather than only in a refusal (FR-005)
- [ ] T022 [US1] Preserve the rest of the form when one field is refused (FR-007)

### Verification

- [ ] T023 [US1] Run T009 and T010 and watch them pass; then break each guarantee and watch it fail — a non-transactional sign-up, and a comparison that short-circuits
- [ ] T024 [US1] Confirm the visibility matrix reports the **same surfaces and the same total** (FR-024). **If a number moved, stop and find out why** — never update the number
- [ ] T025 [US1] Confirm `auth-surface.spec.ts`'s public snapshot gains **exactly one** entry so far and the operator snapshot is unchanged (FR-023, FR-025), and that signing up cannot produce an operator whatever the request body contains
- [ ] T026 [US1] Confirm the account sign-up creates is an **ordinary person** (FR-006) — it appears on a profile surface, in search and in a feed with no change to any of them. The requirement is that this feature adds nothing to what a person is, and an untested "nothing changed" is the claim most likely to be false

**Checkpoint**: an account can be created in the app. It cannot be returned to.

---

## Phase 4: User Story 2 — Sign in again (Priority: P1)

**Goal**: a person returns with the email address and password they chose.

**Independent Test**: create an account, sign out, sign in again, find the same profile and
the same posts.

### The test that has to come first

- [ ] T027 [US2] Write `apps/api/tests/integration/auth-signin-timing.spec.ts`: refusals for an unknown address and for a wrong password must not separate — same message, same status, and **compared as distributions over repeated samples**, not as single measurements (SC-004, contract §4)
- [ ] T028 [US2] **Watch T027 fail against a deliberately naive implementation** that returns early for an unknown address. It is the implementation anybody would write, it satisfies the message, and it leaks the answer by two orders of magnitude. A timing test that has never seen the leak is a timing test nobody should trust

### Implementation

- [ ] T029 [US2] Implement sign-in in `auth.service.ts`, deriving the password **whether or not the address exists** — against a fixed dummy hash when it does not (research R3)
- [ ] T030 [US2] Add `POST /v1/auth/sign-in`, `@Public()` and rate limited by the existing decorator, which keys on the **client IP** for an unauthenticated route (research R7)
- [ ] T031 [P] [US2] Add `signIn` by email and password to `apps/mobile/src/data/session.ts`
- [ ] T032 [US2] Rewrite `apps/mobile/src/features/auth/SignInScreen.tsx` around email and password, keeping the server address behind the control added in 010 (FR-027, FR-029)
- [ ] T033 [US2] Rewrite `apps/mobile/src/screens/SignInContainer.tsx` for credentials, keeping `describeFailure`'s structured `status === 0` network case — it reads a signal rather than matching prose, and the prose version was dead code for the only case it existed for
- [ ] T034 [US2] Let a person move between signing in and creating an account without losing the email they typed (FR-028)

### Verification

- [ ] T035 [US2] Confirm the public snapshot now holds **exactly two** new entries and no others (SC-007, MVP count)
- [ ] T036 [US2] Confirm the rate limit is keyed on something that **cannot** depend on whether the account exists, and that a bucket exhausted by attempts against an unknown address refuses the same way as one exhausted against a known one (FR-010)

**Checkpoint**: Phases 1–4 are the MVP. The app opens like an app.

---

## Phase 5: User Story 3 — Stay signed in, leave deliberately (Priority: P2)

**Goal**: yesterday's sign-in still holds; signing out is a deliberate act.

- [ ] T037 [US3] Confirm the credential survives a relaunch, using the device key-value store 009 added — and confirm it by **relaunching**, not by asserting the store was called
- [ ] T038 [US3] Add a sign-out control that removes the stored credential, and confirm the next launch asks for sign-in (FR-012)
- [ ] T039 [US3] On a rejected credential, return to sign-in **with an explanation** rather than rendering an empty feed (FR-013). This is the step that gets skipped and the one people hit
- [ ] T040 [US3] Add a Maestro flow covering sign-up, sign-out and sign-in, and run `node scripts/verify-maestro-ids.mjs` — a selector that matches nothing fails as a thirty-second timeout twenty minutes into a device run. It asserts the **path is populated at every step** (SC-001, SC-003); SC-002's sixty seconds needs a person, because a stopwatch on a runner times the machine, and it is recorded **not run** rather than claimed

**Checkpoint**: the session behaves like a session.

---

## Phase 6: User Story 4 — Password reset (Priority: P3, separately releasable)

**⚠️ Needs an outside service. Nothing in Phases 3–5 may import the mail port.**

- [ ] T041 [P] [US4] Define `apps/api/src/ports/mail.port.ts` and **leave it unbound** (research R6). Binding a do-nothing adapter "for later" produces a reset that silently succeeds and sends nothing
- [ ] T042 [US4] Add the credential **epoch**: stored on the credential record, carried in the credential, compared during verification (research R4, FR-021). **An absent epoch on either side verifies** — accounts created by the device-token tool hold no credential record and their credentials predate the claim
- [ ] T043 [US4] Confirm a **device-token account still works after T042** (FR-026): mint one, call `GET /v1/me`, and get 200. This is the assertion that fails if the epoch comparison fails closed, and the population it would sign out is every emulator journey and the laptop runbook
- [ ] T044 [US4] **Measure what T042 costs.** Verification gains a datastore read on the hottest path in the product. If it costs, memoise per request beside `RelationshipCache`, which 008 already does for privacy — but measure before optimising and record the number either way
- [ ] T045 [US4] Implement the reset request row, **storing the token hashed** — it is a bearer permission to take over an account, so the link in somebody's inbox must be the only copy of the secret
- [ ] T046 [US4] Make the response to a reset request identical whether or not an account exists, and send nothing when it does not (FR-019)
- [ ] T047 [US4] Enforce single use with a **conditional write** on `usedAt` being absent, not a read followed by a write — the same race in a third place
- [ ] T048 [US4] Advance the epoch on completion, and confirm a credential obtained **before** the reset stops working (FR-021)
- [ ] T049 [US4] Add `POST /v1/auth/reset-request` and `POST /v1/auth/reset` to `auth.controller.ts`, both `@Public()` and rate limited. **Both are necessarily public**: a person who has forgotten their password holds no credential, so a reset route demanding one could never be used by the only person who needs it. FR-023's first version forbade these and Phase 6 had no controller task at all — the row, the identical response and the single-use condition were specified with nothing to call them
- [ ] T050 [US4] Confirm the public snapshot now holds **exactly four** new entries in total and loses none, and that the operator snapshot is still unchanged (FR-023, SC-007)
- [ ] T051 [US4] Bind a mail adapter, register the Principle V divergence in `docs/verification/divergence-register.md`, and confirm `pnpm verify:register` passes
- [ ] T052 [US4] Deliver a real message to a real inbox before this is offered to anybody. A local test of a mail adapter is not evidence that mail is delivered
- [ ] T053 [US4] Add the reset controls to the app — and **not before this phase ships** (FR-022)

**Checkpoint**: a forgotten password is recoverable.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T054 [P] Add a guard that fails the build if a password, or a derived password, can reach a log, a response body or an error — **verified against a planted leak**, because care is not a control (SC-008, FR-015, FR-016)
- [ ] T055 [P] Confirm the email address appears on **no** profile projection. `profile.projection.ts` is the one place a `PublicProfile` is built, and adding a field there publishes it on all seven at once
- [ ] T056 [P] Confirm device-token accounts are **unreachable through sign-in** (FR-026's other half): they hold no credential record, so sign-in has nothing to resolve. It needs no enforcing and it is asserted anyway, because a MUST NOT nobody checks is a MUST NOT nobody notices breaking
- [ ] T057 [P] Add the two — later four — new paths to the **base** contract at `specs/001-interest-media-sharing/contracts/openapi.yaml` and regenerate the client through `packages/shared/scripts/contract.ts`. **Not `contracts/openapi.yaml`, which does not exist**, and not the overlay, which holds only what a fork adds. 002's first defect was the contract and the API disagreeing while each looked right alone
- [ ] T058 [P] Update `docs/laptop-runbook.md`: `pnpm token` stops being the way in and becomes the fallback for device passes
- [ ] T059 [P] Update `CLAUDE.md` — "the local profile has no signup endpoint" is repeated in several places and stops being true with Phase 4
- [ ] T060 [P] Stop 009's session descriptor printing a live credential into a world-readable job summary. CLAUDE.md states that exposure "ends when email/password identity lands and a session hands out only an address", and this is that feature — so it either closes here or is recorded as still open, never left to be assumed closed
- [ ] T061 Run the real CI step list before pushing, not a proxy for it. Two red builds have come from checking typecheck, lint and tests and assuming that covered CI
- [ ] T062 Record the run in `docs/verification/runs/`, with every criterion pass, fail or **not run** — never blank — and **count the items** rather than reading the highest number, which this project has got wrong twice

---

## Success criteria → the task that measures each

| Criterion | Measured by |
|---|---|
| SC-001 no token or address shown | T040 on a device |
| SC-002 account creation under 60s | **not run** — needs a person; T040 measures the path is populated at every step |
| SC-003 still signed in tomorrow | T037, T040 |
| SC-004 refusals indistinguishable | T027, T028 |
| SC-005 one account under concurrency | T009, T023 |
| SC-006 matrix unchanged | T024 |
| SC-007 two public routes, four after US4 | T025, T035, T050 |
| SC-008 no password in any output | T054 |
| SC-009 reset within five minutes | T052 |

## Requirements with no task, and why

None. FR-006 gained T026 and FR-026 gained T043 and T056 in the analysis pass; both had
been specified and left unmeasured.

## Dependencies

```text
Phase 1 (setup)
   └─> Phase 2 (handle uniqueness, existing set included) ── BLOCKS EVERYTHING
          └─> Phase 3 (US1 sign up)
                 └─> Phase 4 (US2 sign in)     ── MVP ends here
                        └─> Phase 5 (US3 session)
                               └─> Phase 6 (US4 reset)  ── independent, needs a provider
                                      └─> Phase 7 (polish)
```

Within Phase 2, T006 gates T007: the back-fill runs only against a set measured not to
collide. US2 depends on US1 only because there is nothing to sign in to before it. US4 is
genuinely independent of US3 and is sequenced last because it needs an account with an
outside provider, not because anything blocks it.

## Parallel opportunities

- T009 and T010 (different test files)
- T018 with T011–T017 (app and API)
- T031 with T029–T030
- Every task in Phase 7 except T061 and T062

## Implementation strategy

**MVP is Phases 1–4.** At that point the app opens, a person creates an account, and they
can come back. Phase 5 makes the session behave properly; Phase 6 is a separate release
that needs something nobody has signed up for yet.
