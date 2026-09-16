# Feature Specification: Disposable Session Server

**Feature Branch**: `claude/pensive-goldberg-jjjni5`

**Created**: 2026-09-12

**Status**: Draft

**Input**: User description: "I want to run the app on my physical Android phone and see the UI. My laptop cannot run the backend — it is out of memory. It must be free, and I do not want to put a credit card anywhere."

## Why This Exists

Nobody has ever used this product on a phone they own. Every automated run to date has put
the app and the backend on the same machine, where reaching one from the other is free. That
arrangement cannot be carried to a real phone: the phone is somewhere else, and the owner's
own computer cannot run the backend either.

Two things are missing, and they are independent.

1. The app is **welded to one backend address**. The address is fixed when the app is built,
   so every new backend address means a new install.
2. There is **no backend a phone can reach** that does not require either the owner's
   machine to be running it, or a cloud account with a payment method on file.

This feature removes both. It is a **development convenience, not a deployment.** It does
not answer the project's open hosting question and must not be recorded as having done so.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Point the app at a backend without reinstalling it (Priority: P1)

The owner opens the app on their phone, types in the address of a backend, signs in, and
uses the product. Later, that backend is gone and a different one exists at a different
address. The owner types the new address into the same installed app and carries on.

**Why this priority**: It is the only story that is valuable on its own, and everything else
depends on it. Without it, each backend address costs a fresh install — which makes any
temporary backend (Story 2) impractical, and makes even a fixed backend fragile, because the
address changes whenever the network does. It also stands alone: it is immediately useful
against a backend on the owner's own network, with none of Story 2 built.

**Independent Test**: Install the app once. Point it at backend A and sign in. Point the same
install at backend B and sign in. Both succeed with no reinstall.

**Acceptance Scenarios**:

1. **Given** a freshly installed app with no address set, **When** the owner opens sign-in, **Then** a built-in default address is offered and can be replaced.
2. **Given** the owner has entered an address and signed in, **When** they close and reopen the app, **Then** the address is still set and they are still signed in.
3. **Given** the owner is signed in against one backend, **When** they change the address to a different backend, **Then** the credential from the previous backend is discarded and they are asked to sign in again.
4. **Given** the owner enters an address that nothing is serving, **When** they try to sign in, **Then** they are shown what went wrong rather than a blank or empty screen.
5. **Given** the on-screen keyboard is open over the sign-in screen, **When** the owner has filled in both the address and the credential, **Then** the control that submits them is reachable without scrolling.

---

### User Story 2 - Start a temporary backend on demand, for free (Priority: P2)

The owner wants to look at the app on their phone. They start a session. A few minutes later
they have an address and a credential. They use the app on their phone from wherever they
are. The session ends on its own later that day. Tomorrow they start another one.

**Why this priority**: This is the reason the feature exists, but it is worth less without
Story 1 and cannot be demonstrated without it. Delivered second, it turns Story 1 from
"useful on my own network" into "useful anywhere".

**Independent Test**: Start a session from a cold state with no accounts and no payment
method anywhere. Receive an address and a credential. Reach the address from a phone on
mobile data — not the same network as anything.

**Acceptance Scenarios**:

1. **Given** no cloud account and no payment method exists anywhere, **When** the owner starts a session, **Then** it starts and costs nothing.
2. **Given** a running session, **When** a phone on an unrelated network opens the app against it, **Then** the app reaches it over an encrypted connection.
3. **Given** a running session, **When** the owner creates an account against its address, **Then** they reach the product's main surface with content already there. (**Amended 2026-09-16**: 011 added sign-up, so a session no longer issues a credential — see FR-014. 013 also deleted the curated catalogue, so what is "already populated" is the seeded demo content, not twelve interests we own.)
4. **Given** a running session, **When** the owner publishes a post with a photograph, **Then** the photograph is stored and renders back on the phone.
5. **Given** a session has been running for its chosen lifetime, **When** that lifetime elapses, **Then** the session ends without the owner doing anything.
6. **Given** the owner starts a session, **When** they choose how long it should last, **Then** it lasts that long and the expiry time is stated up front.

---

### User Story 3 - Get the address without hunting for it (Priority: P3)

The owner starts a session from their phone. When it is ready, everything they need to type
into the app is in front of them, on the phone, in a form they can copy from.

**Why this priority**: A session whose address cannot be found is a session that does not
work. It is P3 only because Stories 1 and 2 can be demonstrated by an owner willing to dig,
and this makes it routine rather than possible.

**Independent Test**: Start a session using only a phone. Obtain both addresses on that phone,
without opening a laptop and without downloading a file, and create an account against the
backend one from inside the app. (**Amended 2026-09-16**, FR-014: the descriptor no longer
carries a credential, so "obtain the credential" became "make one".)

**Acceptance Scenarios**:

1. **Given** a session has started, **When** the owner looks at its result on a phone, **Then** both addresses and the expiry time are readable there. (**Amended 2026-09-16**, FR-014: not the credential.)
2. **Given** a session fails to start, **When** the owner looks at the result, **Then** it names which step failed.
3. **Given** a session is running, **When** the owner checks on it, **Then** they can tell whether it is still alive and how long it has left.

---

### Edge Cases

- **A session expires while the app is open.** The owner is mid-scroll when the backend disappears. The app must show that it cannot reach the backend, not an empty feed that looks like the product has no content.
- **A stale credential meets a new backend.** A credential is only meaningful to the session that issued it. Carrying one across must not leave the owner in a half-signed-in state.
- **One address works and the other does not.** The product serves media separately from the rest of the application. If only one of the two is reachable, the symptom is a working app with blank images — which reads as a defect in the product rather than a problem with the setup, and must not.
- **An address is typed wrongly.** Phones make this likely. A wrong address must fail visibly at sign-in, not silently later.
- **The owner never sets an address.** The app must still do something sensible rather than fail obscurely.
- **Two sessions are started at once.** Each must be independent; neither may adopt the other's identities or data.
- **A session is asked to start while an earlier one is still running.** This must not corrupt or hijack the running one.
- **The session starts from nothing every time.** Anything published in a previous session is gone. The product must be usable from an empty datastore, not merely from a populated one.

## Requirements *(mandatory)*

### Functional Requirements

#### Pointing the app at a backend (US1)

- **FR-001**: A person MUST be able to set the backend address from within the app, without reinstalling or rebuilding it.
- **FR-002**: A set address MUST survive closing and reopening the app.
- **FR-003**: When no address has been set, the app MUST use a built-in default and MUST allow it to be replaced.
- **FR-004**: When the configured address cannot be reached, or refuses the credential, the app MUST say so. It MUST NOT present the failure as an absence of content.
- **FR-005**: Changing the backend address MUST discard any credential held for the previous address.
- **FR-006**: On the sign-in surface, the control that submits the address and credential MUST remain reachable while the on-screen keyboard is open.
- **FR-007**: Setting an address MUST NOT be capable of changing what the app is permitted to see. Every visibility and authorisation decision stays with the backend.

#### The session backend (US2)

- **FR-008**: The owner MUST be able to start a temporary instance of the product on demand.
- **FR-009**: Starting a session MUST NOT require a cloud account, a payment method, or any credential the owner does not already hold.
- **FR-010**: A session MUST be reachable from a device on any network, not only a network shared with the owner.
- **FR-011**: A session MUST be reachable over an encrypted connection.
- **FR-012**: A session MUST serve both the application and the media it stores, at addresses a phone can reach.
- **FR-013**: A session MUST start with the interest catalogue populated, so the product is usable immediately.
- **FR-014**: ~~A session MUST issue at least one credential that can sign in to it. The product has no self-service sign-up, so a session without one is unusable.~~ **WITHDRAWN 2026-09-16.** Its stated premise — "the product has no self-service sign-up" — was made false by 011, which added `POST /v1/auth/sign-up`. **Replaced by FR-014a**: a session MUST NOT publish a credential in its descriptor. The bring-up still mints one through the application's own `PersonRepository` for its own checks and for seeding; that credential never leaves the runner. Where this repository is public a job summary is world-readable, so a published credential is live against a live address for anyone reading the Actions tab. See `contracts/session-descriptor.md` §2.
- **FR-015**: Each session MUST generate its own signing secret. No secret may be shared between sessions or stored in the repository.
- **FR-016**: A session MUST end automatically after a bounded lifetime, with no action from the owner.
- **FR-017**: The owner MUST be able to choose that lifetime when starting the session, within a stated maximum.
- **FR-018**: A session MUST NOT relax any visibility, authentication, or privacy rule the product enforces elsewhere.
- **FR-019**: A session MUST be described, wherever it is presented, as a temporary development environment and not as a deployment of the product.

#### Getting what you need out of it (US3)

- **FR-020**: When a session is ready, both addresses and the expiry time MUST be presented together, readable on a phone, without downloading anything. (**Amended 2026-09-16** with FR-014: a credential is no longer among them, and must not be.)
- **FR-021**: When a session fails to start, the result MUST name the step that failed.
- **FR-022**: While a session is running, the owner MUST be able to determine that it is still alive and how much of its lifetime remains.

### Key Entities

- **Session**: A temporary, self-contained running instance of the product. Has a lifetime, an expiry time, its own signing secret, a populated interest catalogue, and an empty datastore at birth. Independent of every other session.
- **Backend address**: The **single** pointer the app holds to the backend it talks to. Settable by a person, persisted on the device, replaceable. A session also serves media from a second address, but **nobody types that one** — it reaches the app inside the links the backend issues, which is why the two must be established in the right order.
- **Session credential**: A sign-in credential issued by one session and meaningless to any other.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the owner starting a session to holding a usable address and credential takes **under 10 minutes**, unattended.
- **SC-002**: **One** installed copy of the app works against **at least three different** backend addresses on different days, with no reinstall.
- **SC-003**: A phone on a network unrelated to the backend completes the full path — sign in, view the feed, publish a post carrying a photograph, and see that photograph render — **on the phone, at least once**, recorded as a device run.
- **SC-004**: **Zero** blank media on that run. Every image the product presents either renders or reports a failure; none renders as empty.
- **SC-005**: A session ends within **5 minutes** of its stated expiry time, without the owner intervening.
- **SC-006**: **Every** failed session start names the step that failed. A start that fails without naming a step is a defect in this feature, not in the thing that failed.
- **SC-007**: Starting and running sessions incurs **zero cost** and requires **zero payment methods**, verified by there being none on file.
- **SC-008**: Changing the backend address and signing in again takes a person **under 2 minutes** on a phone, including typing.

## Assumptions

Recorded because the feature description did not settle them and a reasonable default
exists. Each is a decision, not an oversight.

- **Default session lifetime is 30 minutes, selectable up to a stated maximum.** Originally
  2 hours, chosen when the compute behind a session was believed to be unlimited. It is not:
  the repository is private, so the monthly allowance is finite and shared with other work,
  and a 2-hour default spent four times what a person actually uses. Confirmed with the owner
  on 2026-09-12. Longer remains one choice away, and a session is cheap to start again.
- **Session data is disposable.** Each session starts from an empty datastore. Carrying data
  between sessions is out of scope; the product is expected to be usable from empty, which is
  a property worth having anyway.
- **The backend-address field is visible to anyone using the app.** The sign-in surface
  already asks a person to paste a credential by hand, because the product has no hosted
  identity provider; a second field on that surface is consistent with it, and the whole
  surface is expected to be replaced when real identity arrives.
- **Anyone holding a valid credential for a session may use it.** A session's address alone
  grants only what the product already makes public. Restricting sessions to a single person
  is out of scope.
- **The owner has a phone capable of installing the app directly**, and does not need their
  own computer to do so.
- **Only the owner, and people they deliberately hand a credential to, will use a session.**
  Sessions are not advertised, indexed, or shared.
- **A session runs the product's real backend**, not a substitute or a mock. What the owner
  sees on the phone is the product.

## Out of Scope

Named explicitly, because each has been mistaken for part of this before.

- **A production deployment.** The project records "no production hosting story" and a
  pending datastore decision as open questions. This feature answers neither, and closing
  them is not a side effect of shipping it.
- **Public availability.** The product's safety obligations gate shipping to people. A
  session is for the owner and people they hand a credential to.
- **Durable data.** See Assumptions.
- **iOS.** Nothing has ever run there, and this feature does not change that.
- **Automated journeys against a session.** The existing device pass runs elsewhere and is
  unaffected. This feature is for a person looking at the product with their own eyes.
