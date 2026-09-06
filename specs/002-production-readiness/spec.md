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

### ~~User Story 3 - Guarantees are proven where real people will use them~~ (REMOVED)

**Removed 2026-09-05 at the project owner's decision: AWS is not the deployment
target.**

This story existed because four capabilities had a production implementation
that differed from its local stand-in — S3, MediaConvert, Cognito and a CDN — and
Principle V requires such divergences to be verified before launch. Rather than
leave four never-executed adapters behind a profile switch with the verification
deferred indefinitely, the adapters themselves were deleted.

That is the honest resolution: there is now **one implementation per port**, the
one that is tested on every change. Nothing is unverified because nothing
production-divergent remains.

**If a managed service is ever adopted, this story comes back with it.** The
moment a second implementation exists, Principle V applies again: it must be
registered as a divergence and verified on the production path before any release
to people outside the team. Removing the story does not remove that rule.

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
  production would be, not only against the development stand-in. This measurement requires
  provisioned infrastructure and is therefore gated on explicit approval (FR-020). Until it is
  performed, SC-002 MUST be reported as unverified rather than inferred from local figures.
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

**Production-path verification (US3) — REMOVED**

FR-013 to FR-023 and FR-031 covered the divergence register, its runbooks,
approval records, teardown confirmation and spend reporting. All are withdrawn
with User Story 3: with AWS dropped there is no local/production divergence to
register, and requirements about verifying one would be requirements about
nothing.

The rule they encoded is not withdrawn — it lives in the constitution
(Principle V), and applies again the moment a second implementation of any port
is introduced.

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

### Risks this spec no longer covers

**Added 2026-09-06**, on the owner's instruction that nothing in this spec may require a real
person or paid cloud resources. Everything now runs against the containerised stack —
DynamoDB Local, MinIO, ffmpeg and a local JWT issuer, all in Docker, with `RUNTIME_PROFILE`
accepting `local` only.

That instruction is followed in full. It does not make the following risks smaller; it means
this spec stops claiming to cover them. They are recorded here so that a reader of a green
run knows exactly what the green does **not** say. Each becomes a live question again the
moment a release outside the team is contemplated.

| Risk | Why no containerised run can answer it |
|---|---|
| Behaviour at 10,000 concurrent | DynamoDB Local saturates at 827 req/s. Any figure from it measures the emulator, as the 2026-09-05 run demonstrated |
| Production datastore behaviour at all | DynamoDB Local is a testing tool. Throttling, hot partitions, and consistency under load do not reproduce |
| Physical device behaviour | Camera and photo-library permissions, backgrounding, real network conditions, vendor OS differences, battery and thermal effects |
| iOS, entirely | The Simulator is macOS-only; there is no macOS runner here and no iOS journey has ever run |
| Whether anyone wants this | Retention, second-post rate, onboarding success — every outcome that needs people using a deployed product |
| Production hosting | There is none. `infra/` describes a table, not a deployable stack, and no adapter exists for any hosted service |

Two of these are load-bearing for a public release and neither is a coding task: **there is
nowhere to run the product**, and **nobody has used it**. Principle IV already forbids
shipping US1–US6 without the safety work; this table is the equivalent list for evidence.

### Measurable Outcomes

- **SC-001**: Every core journey completes successfully from the app against a running service
  on every change, with zero journeys covered only by a stand-in.
- **SC-002**: **RESTATED 2026-09-06** (owner decision: nothing in this spec may require paid
  cloud resources). The original wording — first content within 2 seconds for 95% of views
  while 10,000 people browse concurrently — cannot be answered by any containerised run, and
  is therefore **withdrawn as an acceptance criterion and retained as an open risk** (see
  *Risks this spec no longer covers*). What replaces it, and what CI now enforces:
  the feed read path is measured over HTTP against the container stack, and the run must
  **attribute** its ceiling — generator, datastore, and application shape measured apart, as
  `bench:ceiling` already does. It passes when the application shape's own ceiling meets the
  2-second budget at the measured concurrency **and** the report names which of the three was
  binding. The 2026-09-05 figures stand as the baseline: generator 187,439 req/s, DynamoDB
  Local 827 req/s, application shape with the datastore stubbed 5,574 req/s.
  **This does not establish behaviour at 10,000 concurrent on a production datastore, and no
  report may imply that it does.**
- **SC-003**: The visibility contract passes in full after every change made to reach SC-002,
  with no reduction in the surfaces or states covered.
- **SC-004**: ~~100% of recorded divergences verified before release.~~ **WITHDRAWN** with
  User Story 3 — there are no divergences left to verify.
- **SC-005**: A published video is playable within 60 seconds for 95% of uploads. With
  ffmpeg now the only transcode implementation, the local measurement **is** the production
  measurement — the caveat that made this a separate criterion has gone with the divergence.
- **SC-006**: **RESTATED 2026-09-06.** Every core journey passes against a running service
  through the app's own screens, driven in a browser on CI, on every change. Physical-device
  and simulator coverage are **withdrawn as acceptance** — the former needs hardware, the
  latter has never booted here in six attempts — and both are retained as open risks below.
- **SC-007**: ~~Each real-usage outcome has a reported figure against its target within one
  reporting cycle of its observation window closing.~~ **WITHDRAWN 2026-09-06.** A real-usage
  outcome needs real people using a deployed product; no containerised run can produce one,
  and a synthetic substitute would be a number about the test harness, not about anyone's
  behaviour. Recorded as an open risk rather than replaced with something that looks like
  evidence and is not.
- **SC-008**: 100% of environments created for any approved paid run are confirmed destroyed
  within 24 hours, with none left running. **Vacuously true as of 2026-09-06**: no task in
  this spec creates a paid environment, so there is nothing to destroy. Retained rather than
  withdrawn, because the day someone does approve a paid run this is the criterion that
  applies, and the partial check (T069) is the thing that would need finishing first.
- **SC-009**: Spend is reported for every approved paid run and stays within the approved
  amount, with zero unapproved charges. To date: **zero spend, zero approvals**.

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
