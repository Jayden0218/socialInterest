# Feature Specification: Production Readiness — Close the Evidence and Scale Gaps

**Feature Branch**: `claude/spec-kit-integration-juhrza`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Close the evidence and scale gaps left open by feature 001: (1) SC-011 — read-time feed assembly is over budget under concurrency (p95 11.8s at 100 concurrent vs a 2s budget), so the feed read path needs to meet its latency budget under load without violating FR-017/SC-009; (2) Principle V — the aws-profile adapters (object store, transcode, identity, CDN) have never been exercised, so a green local suite is not evidence the production path works, including SC-003 video-playable-in-60s which is only ffmpeg-verified; (3) the React Native client has never talked to the running API — it is verified only by render tests against a generated client; (4) SC-001, SC-004, SC-007, SC-008 and SC-010 depend on real usage data that no test can produce, so they need a defined measurement and reporting path rather than an instrumented dead end."

## Why This Feature Exists

Feature 001 completed every task it defined, and its test suite passes. That is not the same
as the product working. Four claims made in 001 are unproven, and one is measurably false:

| 001 criterion | Actual state |
|---|---|
| SC-011 — 10,000 concurrent without noticeable slowdown | **Measurably failing.** p95 11.8s at 100 concurrent against a 2s budget |
| SC-003 — video playable within 60s | Verified against the development stand-in only |
| SC-001, SC-004, SC-007, SC-008, SC-010 | Instrumented, never measured — no population exists |
| The app works | The client has never exchanged a single request with the service |

This feature closes those four gaps. It adds no user-facing capability. Its entire value is
converting claims into evidence, and one failing number into a passing one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The app and the service actually work together (Priority: P1)

A person installs the app on a real device, signs in, follows interests, publishes an image
and a video, browses their feed, comments, and reports something — all against the running
service. Today none of this has ever happened: the app is verified only against a stand-in
that always answers correctly, so any disagreement between the two would first appear in
front of a real person.

**Why this priority**: Nothing else in this feature is worth measuring until the product
demonstrably functions end to end. It is also the only story here that is completely
unblocked — it needs no cloud account and no spend — so it is both the most fundamental and
the cheapest to close.

**Independent Test**: Run every core journey from the app against a running service instance
and confirm each completes. Delivers, for the first time, evidence that the product works at
all.

**Acceptance Scenarios**:

1. **Given** a running service instance and the app on a device, **When** a person completes
   sign-in, interest follow, image publish, video publish, feed browse, comment, report and
   block, **Then** every journey completes and shows the expected result.
2. **Given** the app and the service disagree about the shape of a request or response,
   **When** the change is built, **Then** the build fails and names the mismatch.
3. **Given** a journey that passes against a stand-in, **When** it is run against the real
   service, **Then** it passes there too, or the difference is reported as a defect.
4. **Given** a release candidate, **When** it is checked before exposure to anyone outside
   the team, **Then** a completed pass on a physical device exists and is recorded.

---

### User Story 2 - The feed stays fast when the app is busy (Priority: P2)

Many people browse at the same time. Each of them sees their feed and interest spaces load
within the stated budget, and a post whose visibility was just changed disappears from every
surface immediately regardless of how busy the system is.

**Why this priority**: This is the one criterion known to be failing rather than merely
unproven, and it degrades smoothly and silently — the product feels fine in development and
gets slower as it succeeds. It ranks below US1 only because a fast feed nobody can reach is
worth nothing.

**Independent Test**: Drive the feed and interest-space reads at rising concurrency against a
production-shaped data store, and confirm the latency budget holds at the target population
while the visibility guarantee still passes in full.

**Acceptance Scenarios**:

1. **Given** the target number of people browsing concurrently, **When** each requests their
   feed, **Then** 95% see first content within the stated budget.
2. **Given** a post is made private while the system is under that load, **When** any surface
   that could return it is read, **Then** it does not appear, on every surface, immediately.
3. **Given** a change made to meet the latency budget, **When** the visibility contract is
   evaluated, **Then** it passes in full, with no surface or state dropped from coverage.
4. **Given** the measurement is run, **When** results are reported, **Then** they state the
   latency at each concurrency level and the level at which the budget is first exceeded.
5. **Given** the budget cannot be met without weakening an existing guarantee, **When** that
   is discovered, **Then** the conflict is recorded and put to the project owner, and the
   guarantee is not weakened to make the number pass.

---

### User Story 3 - Guarantees are proven where real people will use them (Priority: P3)

Before anyone outside the team touches the product, each capability whose development
stand-in is a *different implementation* from the production service has been exercised on
the production path, and the result recorded. Video really does become playable in time.
Location metadata really is stripped. Sign-in really works. Media really is unreachable by
someone not permitted to see it.

**Why this priority**: These are the guarantees most likely to be wrong and least likely to
look wrong — a green suite against a different implementation reads exactly like a green
suite against the real one. It ranks here because, unlike US1 and US2, it cannot start
without the project owner authorising spend.

**Independent Test**: For each recorded divergence, run the verification on the production
path and record the outcome; confirm the list of divergences is complete.

**Acceptance Scenarios**:

1. **Given** the list of divergences between development and production implementations,
   **When** a release outside the team is proposed, **Then** every entry has a completed
   verification with a recorded result.
2. **Given** a video published on the production path, **When** its time to playable is
   measured, **Then** 95% are playable within 60 seconds.
3. **Given** a client that skips every client-side protection, **When** it uploads media
   carrying location metadata on the production path, **Then** the metadata is absent by the
   time anyone can read that media.
4. **Given** a viewer not permitted to see a piece of media, **When** they request it directly
   through the production delivery path, **Then** they do not receive it.
5. **Given** a new capability is added whose implementations diverge, **When** it is not added
   to the divergence list, **Then** the change is treated as incomplete.
6. **Given** a verification has finished, **When** its environment is checked, **Then** it has
   been destroyed and the destruction confirmed.

---

### User Story 4 - Stated outcomes are measured against real usage (Priority: P4)

The team can say, with numbers from real people, whether onboarding is fast enough, whether
first posts succeed, whether people converge on shared interests, whether duplicate warnings
work, and whether reports get decided in time — including when the answer is no.

**Why this priority**: These outcomes cannot be faked by any test, and acting on guesses about
them would be worse than admitting they are unknown. It is last because it needs both a
running deployment and a real population, making it the most gated work here.

**Independent Test**: Open an observation window with a defined population, then produce a
report giving each outcome against its target.

**Acceptance Scenarios**:

1. **Given** an observation window has closed, **When** the report is produced, **Then** each
   outcome has a figure stated against its target, including those that missed.
2. **Given** an outcome cannot be derived from what the product records, **When** the window
   is about to open, **Then** the gap is closed first or the outcome is reported as
   unmeasurable rather than estimated.
3. **Given** reports were filed during the window, **When** the moderation-response outcome is
   computed, **Then** reports that received no decision are counted as missed, not omitted.
4. **Given** a report is published, **When** it is inspected, **Then** no individual person is
   identifiable from it.
5. **Given** the window closes with too few participants for the figures to mean anything,
   **When** the report is produced, **Then** it says so instead of publishing a number.

---

### Edge Cases

- **The measurement harness saturates before the service does.** A load result is worthless if
  the generator is the bottleneck. The measurement must establish that it is measuring the
  service and not itself.
- **The container or session dies between provisioning a verification environment and tearing
  it down**, leaving billable resources running that nobody is watching. Teardown cannot
  depend on the same process that created the environment surviving.
- **Meeting the latency budget appears to require holding read results.** Any such approach
  collides with the immediate-visibility guarantee. The guarantee wins; the conflict is
  escalated, not quietly resolved.
- **A journey passes in a simulator and fails on a physical device** — permissions, real
  network conditions, background suspension, camera and photo-library access.
- **The production path passes once, then the development stand-in drifts further from it.**
  A verification is evidence about a point in time, not a standing guarantee.
- **A verification environment is approved for one purpose and reused for another** without a
  new approval.
- **The observation window overlaps a change that alters the thing being measured**, making the
  figures describe two different products.
- **The production path fails a guarantee that the development path passes.** This is the case
  the whole story exists for; it must produce a blocking defect, not a footnote.

## Requirements *(mandatory)*

### Functional Requirements

**End-to-end client and service (US1)**

- **FR-001**: Every core journey — sign in, follow an interest, publish an image post, publish
  a video post, browse the home feed, view an interest space, comment, report, block — MUST be
  completable from the app against a running service instance, with no stand-in substituting
  for the service.
- **FR-002**: The core journeys MUST run automatically on every change, against a running
  service instance, so a break between app and service fails the build.
- **FR-003**: A disagreement between app and service about the shape of a request or response
  MUST surface as a build failure, not as an error a person encounters.
- **FR-004**: The automated end-to-end journeys MUST run without a cloud account or cloud
  credentials.
- **FR-005**: At least one complete pass of the core journeys MUST be performed on a physical
  device of each supported mobile platform before any release to people outside the team, and
  the result recorded.

**Feed latency under concurrency (US2)**

- **FR-006**: Feed and interest-space reads MUST meet the stated latency budget while the
  target number of people browse concurrently.
- **FR-007**: A change to a post's visibility MUST continue to take effect on every surface
  immediately, both at rest and under load. No approach that requires visibility to be
  re-applied to stored copies may be adopted.
- **FR-008**: Concurrency behaviour MUST be measured against a data store configured as
  production would be, not only against the development stand-in.
- **FR-009**: The measurement MUST report latency at each concurrency level tested and identify
  the level at which the budget is first exceeded.
- **FR-010**: Any change made to meet the budget MUST be re-verified against the complete
  visibility contract before it is accepted, with no reduction in the surfaces or states
  covered.
- **FR-011**: If the budget cannot be met without weakening an existing guarantee, the conflict
  MUST be recorded and put to the project owner. The guarantee MUST NOT be weakened to make the
  measurement pass.
- **FR-012**: The measurement MUST establish that the load generator is not itself the limiting
  factor, and MUST report how that was established.

**Production-path verification (US3)**

- **FR-013**: A list MUST be maintained of every capability where the development stand-in and
  the production service are different implementations rather than emulations of one another.
- **FR-014**: The list MUST be complete. Adding a capability with such a divergence without
  adding it to the list MUST be treated as an incomplete change.
- **FR-015**: Each entry on the list MUST have a completed verification on the production path,
  with the result recorded, before any release to people outside the team.
- **FR-016**: Video publishing MUST be verified to meet the playable-within-60-seconds outcome
  on the production path.
- **FR-017**: Removal of location and other identifying metadata from media MUST be verified on
  the production path, exercised through the path a modified or hostile client would take.
- **FR-018**: Sign-in MUST be verified on the production identity path.
- **FR-019**: Media delivery MUST be verified on the production delivery path, including that a
  viewer who is not permitted to see a piece of media cannot retrieve it by requesting it
  directly.
- **FR-020**: No production-path verification may begin without explicit, specific approval
  from the project owner for that verification, and the approval MUST be recorded. Approval for
  one verification is not approval for another.
  **Scope resolution** (see [research.md](./research.md#resolved-the-open-clarification-from-specmd-fr-020)):
  this feature delivers US1 and US2 with zero spend, and takes US3 and US4 to the point of
  being executable — register, runbooks, teardown and spend checks built and dry-runnable — then
  stops. Starting US3 or US4 still requires the project owner's specific approval; this staging
  is how the feature stays ready for either answer, not a substitute for the decision.
- **FR-021**: Every environment created for a verification MUST be destroyed when that
  verification completes, and the destruction MUST be confirmed by a check that does not depend
  on the process that created it.
- **FR-022**: The cost incurred by each verification MUST be recorded and reported against the
  amount approved.
- **FR-023**: A verification result MUST record the date and the version verified, and MUST NOT
  be treated as evidence for a later version without being repeated.

**Real-usage measurement (US4)**

- **FR-024**: Each outcome that depends on real usage MUST have a defined population,
  observation window, and reporting cadence, agreed before the window opens.
- **FR-025**: Each such outcome MUST be derivable from what the product already records. Where
  it is not, the gap MUST be closed before the window opens, or the outcome MUST be reported as
  unmeasurable rather than estimated.
- **FR-026**: Results MUST be reported against the stated target, including and especially when
  the target is missed.
- **FR-027**: The moderation-response outcome MUST be derived from the moderation record, and
  MUST count reports that received no decision as missed rather than excluding them.
- **FR-028**: Reports MUST contain aggregates only, and MUST NOT allow an individual person to
  be identified.
- **FR-029**: A person's activity MUST NOT be used for any purpose beyond operating the product
  and producing these aggregate measures.
- **FR-030**: Where a window closes with too few participants for the figures to be meaningful,
  the report MUST say so rather than publish a number.

### Key Entities

- **Divergence Record**: One capability where the development stand-in and the production
  service are different implementations. Holds what differs, why it matters, and what would
  count as proof the production path works.
- **Verification Run**: One attempt to prove a Divergence Record on the production path. Holds
  the date, the version verified, the outcome, the approval it ran under, and the cost.
- **Approval Record**: The project owner's explicit permission for one specific piece of
  billable work. Holds what was approved, the ceiling, and when.
- **Load Measurement**: One concurrency run. Holds the concurrency levels tested, latency at
  each, the level at which the budget was first exceeded, and the evidence that the generator
  was not the bottleneck.
- **Outcome Measure**: One real-usage outcome. Holds its target, population, window, the figure
  observed, and whether it met the target.
- **Journey Run**: One end-to-end pass of the core journeys. Holds the environment, whether it
  was a simulator or a physical device, and the per-journey result.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every core journey completes successfully from the app against a running service
  on every change, with zero journeys covered only by a stand-in.
- **SC-002**: Feeds and interest spaces display first content within 2 seconds for 95% of
  views while 10,000 people browse concurrently.
- **SC-003**: The visibility contract passes in full after every change made to reach SC-002,
  with no reduction in the surfaces or states covered.
- **SC-004**: 100% of recorded divergences have a completed production-path verification, with
  a recorded result, before any release to people outside the team.
- **SC-005**: A published video is playable within 60 seconds for 95% of uploads, measured on
  the production path.
- **SC-006**: Every core journey passes on a physical device of each supported mobile platform
  at least once before any release outside the team.
- **SC-007**: Each real-usage outcome has a reported figure against its target within one
  reporting cycle of its observation window closing.
- **SC-008**: 100% of environments created for verification are confirmed destroyed within 24
  hours of that verification completing, with none left running.
- **SC-009**: Spend is reported for every verification and stays within the approved amount,
  with zero unapproved charges.

## Assumptions

- The 10,000-concurrent target and the 2-second budget are carried over unchanged from feature
  001; this feature does not renegotiate them.
- The hybrid approach already recorded in feature 001's design record — materialising only the
  highest-volume interests — is available as a way to meet SC-002. Full fan-out-on-write remains
  excluded, because it cannot satisfy immediate visibility change.
- Real-usage outcomes require a closed group of participants. Assumed at 50 or more people over
  a continuous window of 14 days or more, unless the project owner sets different figures.
- A physical-device pass on one representative device per supported mobile platform is
  sufficient; a device matrix is not in scope.
- Verification environments are short-lived and destroyed after use. Ongoing hosting, a
  permanent staging environment, and public launch are all out of scope here.
- No guarantee established by feature 001 is relaxed by this feature. Where this feature and
  001 conflict, 001's guarantees win and the conflict is escalated.
- Feature 001 is complete and its suite passes; this feature builds on it rather than reworking
  it.

## Dependencies

- **Feature 001** must be in place. It is.
- **US3 and US4 are blocked on the project owner's explicit approval to incur cost.** Neither
  can be verified on a developer machine: US3 exists precisely because the local path is a
  different implementation, and US4 needs real people. US1 and US2 have no such dependency and
  can proceed immediately.

## Out of Scope

- Any new user-facing capability.
- Public launch, app-store submission, and ongoing production hosting.
- Re-opening design decisions recorded in feature 001 that this feature does not contradict.
- SC-012 of feature 001 (second post within 7 days), which is a post-launch business outcome
  rather than an engineering gap.
