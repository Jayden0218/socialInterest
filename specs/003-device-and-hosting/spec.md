# Feature Specification: Verified in the cloud, end to end

**Feature Branch**: `003-device-and-hosting`

**Created**: 2026-09-06

**Status**: Draft

**Input**: User description: "Feature 003: the eight items feature 002 concluded without closing." **Revised 2026-09-06** on the owner's instruction: *everything must be done in the cloud — no physical phone of the owner's, no human tester, all of it performable by the agent.*

## Why This Feature Exists

Feature 002 closed with 77 tasks done and CI green, and was honest that this did not mean the
product worked on a phone or ran anywhere. Two facts underpin this feature:

1. **The product has never rendered a frame on Android.** Six CI emulator runs produced zero
   devices; the only Android capture in existence is black. Every UI check so far renders the
   same components through a browser's DOM rather than Android's native views.
2. **There is nowhere durable to run it.** The datastore is a testing tool, the identity
   provider signs its own tokens with a development secret, and the event bus loses everything
   on restart.

002 proved a green suite is not a working product — it found eighteen defects every existing
test passed. The same gap now sits one level up: **a working browser build is not a working
phone app, and a container that forgets everything is not a service.**

## The constraint this feature is built around

Everything here must be achievable **by the agent, in the cloud, at no cost, with no physical
device and no human tester.** That rules some things in and one thing decisively out.

| Carried from 002 | Under the cloud-only constraint |
|---|---|
| 1 · Never run on Android | **In scope.** An emulator in CI is cloud-only and free. Six attempts failed, but none ever captured the emulator's own error output — that is the gap to close first, not another guess |
| 2 · Nowhere to run it | **In scope, reframed.** Not a public production host, which needs an account and credentials the agent does not have. Instead: a stack whose pieces are the same software production would run, and that survives a restart |
| 3 · Datastore choice (D3) | **In scope.** A written decision costs nothing, and it decides whether item 5 is answerable at all |
| 4 · Nobody has used it | **WITHDRAWN — see below** |
| 5 · Behaviour under load | **In scope, conditionally.** Answerable only if the datastore is software that also runs in production |
| 6 · Media from a device library | **In scope.** An emulator has a photo library, and media can be placed in it and permissions exercised without a person |
| 7 · Teardown check unwritten | **In scope, and startable now** |
| 8 · iOS unverified | **Out of scope.** Needs a macOS host; on a private repository those runner minutes bill at ten times the rate. Reported unverified |

### What the constraint costs, stated once

**Item 4 cannot survive it.** Whether anyone wants this product — retention, whether people
post a second time, whether onboarding works — needs people using it. A script that exercises
those paths measures the script. Feature 002 withdrew the same criteria rather than fake them,
and this feature does the same: **it is withdrawn, not met, and not replaced.**

That is the honest price of an agent-only spec, and it is a real one: this feature can prove
the product *works*, and cannot prove it is *good*. Everything else on the list is genuinely
reachable from here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The app runs on Android, and the agent drives it (Priority: P1)

The built app is installed on an emulator in CI and driven through the core journeys by
automation: sign in, browse interests, follow one, publish, comment, react, report, block.
What renders is Android's own view system — real touch dispatch, the system back button,
platform fonts and insets — not a browser's approximation.

**Why this priority**: The largest unknown in the product. Nothing about Android layout,
gestures or native modules has ever been observed. It is also entirely free and entirely
within the agent's reach.

**Independent Test**: Boot an emulator in CI, install the app, drive the journeys, and capture
a screenshot of the app's own interface that is not blank.

**Acceptance Scenarios**:

1. **Given** an emulator that has failed to boot six times, **When** it is next attempted,
   **Then** the emulator's own error output is captured and reported, whether it boots or not.
2. **Given** a booted emulator and a running service on the same machine, **When** the app is
   installed and launched, **Then** it renders its first screen and the service records the
   request that produced it.
3. **Given** the app running, **When** each core journey is driven through the screen, **Then**
   every journey completes and the service confirms the effect of each.
4. **Given** repeated failure with the error output in hand, **When** the cause is a property
   of the runner rather than the product, **Then** it is recorded with evidence and Android is
   reported unverified — never inferred from the browser build.

---

### User Story 2 - The service keeps what it is given (Priority: P1)

The service runs against a stack whose pieces are the same software a production deployment
would run, and data written to it is still there after every part of it restarts.

**Why this priority**: Today the datastore is a testing tool, the event bus is in memory, and
identity is signed with a development secret — so nothing in the product has ever been shown
to survive a restart. Fixing that needs no host and no account, and it is what makes the load
question in Story 5 answerable at all.

**Independent Test**: Write data, restart every component, and read it back. Then confirm a
token signed with the development secret is refused.

**Acceptance Scenarios**:

1. **Given** a running stack, **When** data is written and every component is restarted,
   **Then** all of it is readable afterwards.
2. **Given** the stack, **When** a token signed with a development secret is presented,
   **Then** it is refused.
3. **Given** the stack, **When** the visibility contract is run against it, **Then** it passes
   in full, over every surface it covers today.
4. **Given** an event is published and the process restarts before it is handled, **When** the
   process comes back, **Then** the event is still handled.

---

### User Story 3 - The datastore choice is settled before anything depends on it (Priority: P1)

The choice recorded in research decision D3 is re-decided in the open, with the migration cost
of each option stated, and with one consequence made explicit: whether the chosen datastore
can run as itself in a container, or only as a stand-in.

**Why this priority**: It decides whether Story 5 has an answer. A datastore whose local form
is an emulator can never be measured honestly without spending; one whose local form is the
same software can. The choice is also welded into every repository class, because D9
deliberately gave the datastore no adapter — so deciding now costs a conversation and deciding
later costs rewriting all of them.

**Independent Test**: A written decision naming the options, the migration cost of each counted
from the actual repository classes, and the effect on measurability.

**Acceptance Scenarios**:

1. **Given** the D3 record and the current code, **When** the decision is revisited, **Then**
   the migration cost of each option is stated concretely and one is chosen.
2. **Given** the decision, **When** it differs from what is implemented, **Then** the work to
   change it is sized before anything is built on top of it.

---

### User Story 4 - Media comes from the device's own library (Priority: P2)

Publishing starts where it should: a person picks from the device photo library, and the app
behaves correctly whether the permission is granted or refused.

**Why this priority**: Publishing is the product's core act and its first step is currently
faked — compose uses a bundled sample because no picker is installed. Permission handling
cannot be checked any other way. P2 because it needs Story 1.

**Independent Test**: Place an image in the emulator's library, pick it through the app, and
publish. Then refuse the permission and confirm the app explains itself.

**Acceptance Scenarios**:

1. **Given** an image in the device library, **When** a person opens compose and selects it,
   **Then** it uploads and publishes.
2. **Given** the media permission is refused, **When** compose is opened, **Then** the app
   explains what it needs and why, and does not appear broken.

---

### User Story 5 - What the datastore does under load (Priority: P2)

The feed read path is measured under concurrency against a datastore running as itself, and
the result names which component was the limit.

**Why this priority**: The existing figure attributes its ceiling to a development emulator, so
the design's real behaviour is unknown in **both** directions — it could be better or worse.
P2 because it depends on Stories 2 and 3.

**Independent Test**: Run the existing measurement against the durable stack and report the
attributed ceiling.

**Acceptance Scenarios**:

1. **Given** a datastore running the same software a deployment would run, **When** the
   measurement runs, **Then** it reports latency at the concurrency reached and names the
   binding component.
2. **Given** a datastore that exists locally only as a stand-in, **When** the measurement runs,
   **Then** its result is reported as a measurement of the stand-in and **not** as a statement
   about the product.

---

### User Story 6 - Nothing that was provisioned is left running (Priority: P2)

The teardown check can actually find what it claims to check, by enumerating resources rather
than assuming.

**Why this priority**: The check exists but its resource query was never written, so it cannot
confirm what it reports. It depends on nothing, needs no approval, and must be trustworthy
before anything is ever provisioned — not after.

**Independent Test**: Present it with a tagged resource and confirm it finds it; remove the
resource and confirm it reports clean.

**Acceptance Scenarios**:

1. **Given** resources tagged as belonging to a run, **When** the check runs, **Then** it
   enumerates them and reports any still present.
2. **Given** none remain, **When** the check runs, **Then** it reports clean, and does so by
   looking rather than by assuming.

### Edge Cases

- **The emulator fails a seventh time.** The outcome must be its captured error output and a
  recorded conclusion, not another hypothesis. Six attempts have already been spent guessing
  at an unobservable failure.
- **A journey passes on Android but not in the browser, or the reverse.** Both are real
  findings about a real difference; neither may be discarded because the other passes.
- **The datastore decision comes out against what is implemented.** The migration cost is
  stated and the decision stands or is knowingly overridden — not quietly dropped because the
  work is large.
- **Media permission is refused.** The app explains; it does not appear broken.
- **A restart loses data that was reported as written.** That is a failed acceptance, not a
  caveat.
- **Something here turns out to need spend after all.** It stops and reports, rather than
  provisioning and asking afterwards.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The core journeys MUST be driven through the app's own screens on an Android
  runtime, with each journey's effect confirmed by the service rather than by the screen alone.
- **FR-002**: Evidence from an Android run MUST include at least one non-blank capture of the
  app's own interface.
- **FR-003**: Any attempt to start an Android runtime MUST capture that runtime's own error
  output, whether it succeeds or fails.
- **FR-004**: If an Android runtime cannot be started, the attempt, its captured output and the
  conclusion MUST be recorded, and Android MUST be reported unverified.
- **FR-005**: Android results MUST NOT be inferred from the browser build, and browser results
  MUST NOT be described as device verification.
- **FR-006**: Data written to the service MUST be readable after every component of its stack
  has restarted.
- **FR-007**: The service MUST refuse tokens signed with a development secret.
- **FR-008**: A published event MUST still be handled if the process restarts before handling
  it.
- **FR-009**: The visibility contract MUST pass in full against the durable stack, over every
  surface it covers today.
- **FR-010**: The datastore decision MUST be re-recorded, with the migration cost of each option
  and with whether that option can run as itself outside a deployment, before anything is built
  on top of it.
- **FR-011**: A person MUST be able to choose media from the device's own library when
  publishing.
- **FR-012**: Refusing the media permission MUST produce an explanation, not a silent failure
  or an apparently broken screen.
- **FR-013**: A load measurement MUST name the component that was the binding constraint, and a
  measurement whose constraint is a development stand-in MUST be reported as a measurement of
  that stand-in rather than of the product.
- **FR-014**: The teardown check MUST enumerate resources by tag and report any still present,
  rather than reporting clean without looking.
- **FR-015**: No task MUST provision a billable resource. Any work that turns out to require one
  MUST stop and report rather than provision.
- **FR-016**: Any outcome that cannot be measured under these constraints MUST be reported as
  unverified, and MUST NOT be replaced by a substitute that measures the test harness rather
  than the product.
- **FR-017**: Outcomes that require people using the product MUST be reported as unanswered by
  this feature, and MUST NOT be reported from synthetic activity.
- **FR-018**: iOS MUST be reported unverified, and MUST NOT be assumed to behave as Android
  does.

### Key Entities

- **Journey Run**: One recorded pass of the core journeys, carrying the runtime it ran on
  (Android emulator, browser), the build used, the date, and a result per journey — never
  blank, and `not run` where a journey was not attempted.
- **Runtime Attempt**: A record of trying to start an Android runtime, carrying the
  configuration used, the runtime's own captured output, and the outcome. Exists so that a
  failure produces evidence rather than a hypothesis.
- **Load Measurement**: A run of the read path under concurrency, carrying the transport, what
  the datastore actually was, the concurrency reached, the latencies observed, and the
  component identified as binding.
- **Datastore Decision**: The re-recorded choice, carrying the options weighed, the migration
  cost of each, whether each can run as itself outside a deployment, and the decision.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every core journey completes on an Android runtime at least once, with each
  journey's effect confirmed by the service — or Android is reported unverified with the
  runtime's own captured output as evidence.
- **SC-002**: At least one non-blank capture of the app's own interface running on Android
  exists.
- **SC-003**: Every attempt to start an Android runtime produces a record containing that
  runtime's own output. Zero attempts end in a conclusion unsupported by it.
- **SC-004**: 100% of data written before a full restart of the stack is readable after it.
- **SC-005**: Zero requests carrying a development-secret token are accepted.
- **SC-006**: The visibility contract passes in full against the durable stack, with no
  reduction in the surfaces or states covered.
- **SC-007**: The datastore decision is recorded, with each option's migration cost and
  whether it can run as itself outside a deployment, before anything is built on it.
- **SC-008**: A person can publish media chosen from the device's own library, and refusing the
  permission produces an explanation rather than a failure.
- **SC-009**: A load measurement reports latency at the concurrency reached and names the
  binding component — and is reported as a measurement of a stand-in whenever that is what it
  measured.
- **SC-010**: The teardown check finds a tagged resource that exists and reports clean only
  when none do.
- **SC-011**: Zero billable resources are provisioned.
- **SC-012**: Zero outcomes are reported as met on the basis of a measurement of the test
  harness rather than the product.

## Assumptions

- **Everything is performable by the agent, in the cloud, at no cost.** No physical device, no
  human tester, no account the agent does not already have. Anything that turns out to need one
  stops and reports (FR-015).
- **The emulator route is worth one more attempt, done differently.** Six runs failed and not
  one captured the emulator's own output; the action hides it. Launching the runtime directly
  and capturing its output makes the seventh attempt informative whatever it returns — which
  none of the previous six were.
- **"Durable" means surviving a restart, not a production estate.** Multi-region, autoscaling,
  disaster recovery and cost optimisation are out of scope.
- **The browser journeys stay.** They are the fastest check the project has and they found
  eighteen defects. Android verification is added alongside them, not in place of them.
- **A containerised datastore counts as real only if it is the same software a deployment would
  run.** This is precisely what Story 3 decides, and why Story 5 depends on it.

## Dependencies

- Story 4 depends on Story 1. Story 5 depends on Stories 2 and 3.
- Stories 1, 2, 3 and 6 depend on nothing outside this repository and can start immediately.

## Out of Scope

- **Whether anyone wants the product.** Retention, second-post rate and onboarding success need
  people using it; a script exercising those paths measures the script. Withdrawn from this
  feature and left genuinely unanswered.
- **iOS.** Needs a macOS host, whose runner minutes bill at ten times the rate on a private
  repository. Reported unverified.
- **A public production deployment.** Needs an account and credentials the agent does not have.
  Story 2 delivers durability, not a public address.
- **Production hardening**: multi-region, autoscaling, disaster recovery, cost optimisation.
- **App store submission.**
- **Any new product capability.** This feature makes what exists verifiable; it adds nothing.
