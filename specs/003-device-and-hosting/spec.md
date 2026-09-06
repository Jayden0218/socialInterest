# Feature Specification: Runnable on a real device, and somewhere to run

**Feature Branch**: `003-device-and-hosting`

**Created**: 2026-09-06

**Status**: Draft

**Input**: User description: "Feature 003: make the product runnable and verifiable on a real device and a real host — the eight items feature 002 concluded without closing." (full text preserved in `## What 002 handed over`)

## Why This Feature Exists

Feature 002 closed with 77 tasks done and CI green, and it was honest about what that did
not mean. Two facts sit underneath everything here:

1. **The product has never run on Android.** Not once, in any form. Six CI emulator runs
   produced zero devices, the cloud sandbox crashloops `system_server` under software
   emulation, and the only Android screenshot in existence is black. Every UI check to date
   renders the same React components through a browser's DOM rather than Android's native
   views.
2. **There is nowhere to run it.** The datastore is a testing tool, the identity provider
   signs its own tokens with a development secret, media processing runs in the API process,
   and the event bus loses everything on restart. `infra/` describes a table, not a
   deployable system.

Feature 002 proved that a green suite is not a working product — it found eighteen defects
that every existing test passed. This feature exists because the same gap now sits one level
up: **a working browser build is not a working phone app, and a working container is not a
running service.**

The instinct to avoid here is the one 002 punished repeatedly: replacing an unanswerable
question with an easier one that looks similar. A browser is not a device. A synthetic script
is not a person. Where something genuinely cannot be answered, this spec says so.

## What 002 handed over

| # | Carried over | Blocked by |
|---|---|---|
| 1 | The app has never rendered a frame on Android | Emulator or device access |
| 2 | iOS entirely unverified — no journey has ever run | macOS host |
| 3 | Nowhere to run the product | A hosting decision (owner) |
| 4 | Nobody has used it; every real-usage outcome unanswered | A deployment and participants |
| 5 | Behaviour on a production datastore at any concurrency | A provisioned datastore |
| 6 | `MediaPickerScreen` unmounted; device-library selection untested | Native picker + a device |
| 7 | `verify:teardown`'s resource-tagging query unwritten | Nothing — plain work |
| 8 | D3 (DynamoDB vs PostgreSQL) worth revisiting before provisioning | An owner decision |

Items 3 and 8 gate items 1, 2, 4 and 5. Item 7 is independent and can be done immediately.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The app runs on Android and someone can drive it (Priority: P1)

A person installs the built app on an Android runtime and completes the core journeys by
touching the screen: sign in, browse interests, follow one, publish, comment, react, report,
block. What appears is Android's own rendering — native views, real touch handling, the
system back button, real fonts and safe areas — not a browser's approximation.

**Why this priority**: This is the single largest unknown in the product. The app has never
rendered a frame on Android, so every layout, gesture and native-module assumption is
untested. It is also the only P1 item that may be achievable without spending money.

**Independent Test**: Install the APK on any Android runtime that boots, drive the journeys,
and capture a screenshot that is not blank. Delivers the first evidence that the app works
on the platform it is written for.

**Acceptance Scenarios**:

1. **Given** a built APK and a reachable service, **When** the app is installed and launched
   on an Android runtime, **Then** it renders its first screen and the service records the
   request that produced it.
2. **Given** the app running on Android, **When** each core journey is driven through the
   screen, **Then** every journey completes and the service confirms the effect of each.
3. **Given** an Android runtime cannot be obtained, **When** that is established, **Then**
   the evidence for why is recorded and the item is reported unverified — never inferred
   from the browser build.

---

### User Story 2 - The service runs somewhere it can keep data (Priority: P1)

The service runs on a host with a public address, backed by a datastore that survives a
restart, an identity provider that does not sign its own tokens with a development secret,
and media processing that does not compete with request handling.

**Why this priority**: Nothing else in this feature can be finished without it. A phone
cannot reach a container in a sandbox; a device farm cannot either; nobody can use a product
that has no address. It is P1 alongside Story 1 because it unblocks the rest.

**Independent Test**: Reach the service from outside the network it runs in, restart it, and
confirm previously written data is still there. Delivers the first deployment of the product.

**Acceptance Scenarios**:

1. **Given** an approved host, **When** the service is deployed, **Then** it answers over
   the public internet and its data survives a restart.
2. **Given** the deployed service, **When** the full visibility contract is run against it,
   **Then** it passes in the same shape it passes locally.
3. **Given** no approval to spend, **When** this story is attempted, **Then** it stops before
   provisioning anything and reports that it is blocked.

---

### User Story 3 - The datastore choice is settled before anything is provisioned (Priority: P1)

The choice between the current datastore and the alternative recorded in research (D3) is
re-decided in the open, with its cost stated, before a datastore is provisioned rather than
after.

**Why this priority**: D9 deliberately gave the datastore no adapter, on the reasoning that
the local emulator speaks the same API — sound while the target was that vendor's cloud,
which has since been dropped. The choice is therefore welded into every repository class.
Deciding before provisioning costs a conversation; deciding after costs rewriting all of
them. It is P1 because Story 2 must not run first.

**Independent Test**: A written decision, with the migration cost of each option estimated
from the actual repository count. Delivers a reversible decision made at the only cheap
moment.

**Acceptance Scenarios**:

1. **Given** the D3 record and the current repository code, **When** the decision is
   revisited, **Then** the cost of each option is stated in concrete terms and one is chosen.
2. **Given** the decision, **When** it differs from the current implementation, **Then** the
   work to change it is sized before any datastore is provisioned.

---

### User Story 4 - Media comes from the device's own library (Priority: P2)

A person choosing what to publish picks from their device's photo library, grants or refuses
the permission that requires, and sees the app behave correctly either way.

**Why this priority**: Publishing is the product's core act and its first step is currently
faked — compose takes a bundled sample image because no picker is installed. Permission
handling in particular cannot be checked any other way. P2 because it depends on Story 1.

**Independent Test**: On a device, pick an image from the library and publish it; then refuse
the permission and confirm the app explains rather than fails silently.

**Acceptance Scenarios**:

1. **Given** the app on a device, **When** a person opens compose and selects from the
   library, **Then** the selected media uploads and publishes.
2. **Given** the permission is refused, **When** compose is opened, **Then** the app explains
   what it needs and why, and does not appear broken.

---

### User Story 5 - What the datastore actually does under load (Priority: P2)

The feed read path is measured against a real datastore under concurrency, and the result
says which component is the limit.

**Why this priority**: The existing measurement attributes its ceiling to the local emulator,
so the design's behaviour on a real datastore is genuinely unknown in both directions — it
could be better or worse. P2 because it needs Story 2 and costs money.

**Independent Test**: Run the existing measurement against the provisioned datastore and
report the attributed ceiling. Delivers the first real answer about scale.

**Acceptance Scenarios**:

1. **Given** a provisioned datastore and approval, **When** the load measurement runs,
   **Then** it reports latency at the target concurrency and names which component was
   binding.
2. **Given** no approval, **When** this is attempted, **Then** it is reported unverified and
   no local figure is offered in its place.

---

### User Story 6 - People use it and the outcomes are reported (Priority: P3)

A defined group uses the deployed product for a declared window, and each outcome gets a
reported figure against its target — including the ones that miss.

**Why this priority**: These are the only criteria that say whether the product is any good
rather than whether it works. P3 because it depends on Stories 1 and 2 and on people.

**Independent Test**: Open a window with a stated start and end, let it run without
adjustment, and publish the report. Delivers the first evidence about actual use.

**Acceptance Scenarios**:

1. **Given** a deployment and a participant group, **When** the window closes, **Then** every
   outcome has a reported figure against its target, misses included.
2. **Given** the window is running, **When** early figures look unfavourable, **Then** the
   window is not shortened, extended or redefined.

---

### User Story 7 - Nothing that was provisioned is left running (Priority: P2)

Every environment created for an approved paid run is confirmed destroyed afterwards, by a
check that can actually find them.

**Why this priority**: The teardown check exists but its resource-tagging query was never
written, so it cannot confirm what it claims to. That gap only matters once something is
provisioned — but it must be closed before, not after. P2 and a prerequisite for Story 5.

**Independent Test**: Create a tagged resource, run the check, and confirm it finds it; delete
it and confirm the check reports clean. Delivers a teardown guarantee that is real.

**Acceptance Scenarios**:

1. **Given** resources created for an approved run, **When** the teardown check runs, **Then**
   it enumerates them by tag and reports any still running.
2. **Given** all resources destroyed, **When** the check runs within 24 hours, **Then** it
   reports none remaining.

---

### User Story 8 - iOS (Priority: P3)

The core journeys run on iOS.

**Why this priority**: iOS is entirely unverified — no journey has ever run on it. P3 because
it needs a macOS host, which no other story requires, and because Android answers most of the
same native questions first.

**Independent Test**: Run the journeys on an iOS runtime and record the result.

**Acceptance Scenarios**:

1. **Given** a macOS host, **When** the journeys are driven on an iOS runtime, **Then** each
   completes and the service confirms its effect.
2. **Given** no macOS host is available, **When** that is established, **Then** iOS is
   reported unverified rather than assumed to behave like Android.

### Edge Cases

- **The Android runtime cannot be obtained at all.** Six attempts have already failed. The
  outcome must be a recorded conclusion with evidence, not a seventh attempt at the same
  approach — and never an inference from the browser build.
- **A journey passes on Android but not in the browser, or the reverse.** Both are real
  findings about a real difference; neither result may be discarded as "the other one works".
- **Approval is given for one paid run and a second is wanted.** Approval for one is not
  approval for the next.
- **A deployed service is reachable but its data does not survive a restart.** That is a
  failed deployment, not a working one with a caveat.
- **A participant window produces unfavourable figures.** Reported as they are.
- **The datastore decision comes out against the current implementation.** The migration cost
  is stated and the decision stands or is knowingly overridden — it is not quietly dropped
  because the work is large.
- **Media permission is refused on the device.** The app explains; it does not appear broken.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The core journeys MUST be driven through the app's own screens on an Android
  runtime, with each journey's effect confirmed by the service rather than by the screen
  alone.
- **FR-002**: Evidence from an Android run MUST include at least one non-blank capture of the
  app's own interface.
- **FR-003**: If an Android runtime cannot be obtained, the attempt, the evidence and the
  conclusion MUST be recorded, and Android MUST be reported unverified.
- **FR-004**: Android results MUST NOT be inferred from the browser build, and browser results
  MUST NOT be described as device verification.
- **FR-005**: The service MUST be reachable from outside its own network when deployed.
- **FR-006**: Data written to the deployed service MUST survive a restart of that service.
- **FR-007**: The deployed service MUST NOT accept tokens signed with a development secret.
- **FR-008**: The visibility contract MUST pass in full against the deployed service, over
  every surface it covers locally.
- **FR-009**: No task MUST provision a billable resource without explicit, specific approval
  recorded before the run; approval for one run MUST NOT be treated as approval for another.
- **FR-010**: The datastore decision MUST be re-recorded with the migration cost of each
  option before any datastore is provisioned.
- **FR-011**: A person MUST be able to choose media from their device's own library when
  publishing.
- **FR-012**: Refusing the media permission MUST produce an explanation, not a silent failure
  or an apparently broken screen.
- **FR-013**: A load measurement MUST report which component was the binding constraint, and
  a measurement whose constraint is a development stand-in MUST NOT be reported as a result
  about the product.
- **FR-014**: The teardown check MUST enumerate resources created for an approved run by tag
  and report any still running.
- **FR-015**: Every environment created for an approved run MUST be confirmed destroyed
  within 24 hours.
- **FR-016**: Spend MUST be reported for every approved run and stay within the approved
  amount.
- **FR-017**: Each real-usage outcome MUST have a reported figure against its target once its
  window closes, including outcomes that miss.
- **FR-018**: A declared measurement window MUST NOT be shortened, extended or redefined after
  its figures begin to appear.
- **FR-019**: Any outcome that cannot be measured MUST be reported as unverified, and MUST NOT
  be replaced by a substitute that measures the test harness rather than the product.
- **FR-020**: iOS MUST be reported unverified until its journeys have run, and MUST NOT be
  assumed to behave as Android does.

### Key Entities

- **Journey Run**: One recorded pass of the core journeys, carrying the runtime it ran on
  (Android device, Android emulator, iOS, browser), the build it used, its date, and a result
  per journey — never blank, and `not run` where a journey was not attempted.
- **Approval Record**: A recorded, specific permission to spend, naming what may be
  provisioned, for how long, and to what limit. Applies to one run.
- **Load Measurement**: A run of the read path under concurrency, carrying the transport, the
  datastore it ran against, the concurrency reached, the latencies observed, and the component
  identified as binding.
- **Measurement Window**: A declared start and end for observing real usage, with its
  participant group and the outcomes it is expected to answer, fixed before it opens.
- **Datastore Decision**: The re-recorded choice of datastore, carrying the options weighed,
  the migration cost of each, the decision, and who made it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every core journey completes on an Android runtime at least once, with each
  journey's effect confirmed by the service — or Android is reported unverified with recorded
  evidence of why.
- **SC-002**: At least one non-blank capture of the app's own interface running on Android
  exists.
- **SC-003**: The deployed service is reachable from outside its network and 100% of data
  written before a restart is readable after it.
- **SC-004**: The visibility contract passes in full against the deployed service, with no
  reduction in the surfaces or states covered.
- **SC-005**: Zero billable resources are provisioned without a recorded, specific approval.
- **SC-006**: 100% of environments created for an approved run are confirmed destroyed within
  24 hours, by a check that enumerates them rather than assuming.
- **SC-007**: The datastore decision is recorded, with the migration cost of each option,
  before any datastore is provisioned.
- **SC-008**: A person can publish media chosen from their device's own library, and refusing
  the permission produces an explanation rather than a failure.
- **SC-009**: A load measurement against a real datastore reports latency at the target
  concurrency and names the binding constraint — or is reported unverified with no local
  figure offered in its place.
- **SC-010**: Each real-usage outcome has a reported figure against its target within one
  reporting cycle of its window closing, misses included — or is reported unverified.
- **SC-011**: Zero outcomes are reported as met on the basis of a measurement of the test
  harness rather than the product.

## Assumptions

- **The cost rule from features 001 and 002 still binds.** Nothing bills without explicit,
  specific approval, and approval for one run is not approval for the next. Stories 2, 5 and 6
  are therefore blocked on the owner, not on engineering, and this spec expects to sit
  unfinished until that decision is made.
- **The browser journeys stay.** They are the fastest check the project has and they found
  eighteen defects. Device verification is added alongside them, not in place of them.
- **A device farm is a legitimate route to Story 1.** Real hardware in someone else's data
  centre answers the same questions as hardware in the room; it needs a reachable service,
  which is why Story 2 gates it.
- **iOS needs a macOS host** and no other story does, which is why it is last.
- **Story 7 needs no approval and no host**, so it can be done immediately and should be,
  since it is a prerequisite for Story 5.
- **"Deployed" means one environment, not a production estate.** Multi-region, autoscaling,
  disaster recovery and cost optimisation are out of scope here.

## Dependencies

- Stories 1, 2, 4, 5, 6 and 8 depend on decisions or resources outside this repository.
- Story 5 depends on Stories 2, 3 and 7. Story 4 depends on Story 1. Story 6 depends on
  Stories 1 and 2.
- Story 7 depends on nothing and can start now.

## Out of Scope

- Production hardening beyond one working environment: multi-region, autoscaling, disaster
  recovery, cost optimisation.
- App store submission and review.
- Any new product capability. Feature 003 makes what exists runnable and verifiable; it does
  not add functionality.
- Re-litigating research decisions other than D3.
