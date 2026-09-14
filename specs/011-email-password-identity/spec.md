# Feature Specification: Email and Password Identity

**Feature Branch**: `claude/pensive-goldberg-jjjni5`

**Created**: 2026-09-14

**Status**: Draft

**Input**: User description: "Email and password identity, so the app opens like a normal social app instead of asking for a pasted token."

## Why this exists

Every other capability this product needs is built. A person can publish, browse a ranked
feed, comment, follow, message, save, report and appeal — and all of it has run on a
physical Android device. What they cannot do is **get in**.

There is no signup endpoint. Identity comes from a JWT issuer with no notion of a human,
and the only way to hold a credential is for a developer to run a script and hand over a
244-character string. That is correct for a device pass on a CI runner and it is not a
product: the first screen of the app asks the person to do something no consumer app has
ever asked.

This feature adds **a way to obtain a credential**. It deliberately changes nothing about
what a credential may see — the visibility boundary, the matrix, and every existing suite
must come out identical, and a moved number means this feature did something it was not
asked to do.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create an account (Priority: P1)

Someone opens the app for the first time. They enter an email address and a password they
choose, pick a handle and a display name, and they are in — straight to the cold start
that asks what they are interested in, then to their feed.

**Why this priority**: Nothing else in this feature is reachable without it, and it is the
single step between the product as it stands and a product somebody who did not build it
can use. It is also independently valuable: with only this, the app opens normally.

**Independent Test**: Install the app on a device that has never been signed in, create an
account, and reach the feed without ever being shown a token or a server address.

**Acceptance Scenarios**:

1. **Given** a device with no stored credential, **When** a person submits a valid email,
   a password meeting the stated floor, an unused handle and a display name, **Then** an
   account exists, they hold a credential, and the next screen is the cold start.
2. **Given** an email address that already has an account, **When** someone submits it at
   sign-up, **Then** the attempt is refused and the message says the address is already in
   use — sign-up MAY reveal this, because a person choosing an address has to be told.
3. **Given** a handle that is already taken, **When** someone submits it, **Then** the
   attempt is refused and names the handle as the reason, leaving the rest of the form
   intact.
4. **Given** two sign-ups for the same email arriving at the same moment, **When** both are
   processed, **Then** exactly one succeeds.
5. **Given** a password below the stated floor, **When** it is submitted, **Then** the
   attempt is refused with what the floor is, before any account is created.

---

### User Story 2 - Sign in again (Priority: P1)

Someone who has an account signs in on the same device after signing out, or on a new
device, using the email address and password they chose.

**Why this priority**: P1 alongside US1 rather than after it. An account you can create and
not return to is not an account; the pair is the smallest thing that is honestly "identity".

**Independent Test**: Create an account, sign out, sign in again with the same credentials,
and arrive at the same profile with the same posts.

**Acceptance Scenarios**:

1. **Given** an existing account, **When** the correct email and password are submitted,
   **Then** a credential is issued and the person reaches their own feed and profile.
2. **Given** an existing account, **When** the password is wrong, **Then** the attempt is
   refused with a message that does not distinguish a wrong password from an unknown
   address.
3. **Given** an email address with no account, **When** any password is submitted, **Then**
   the refusal is indistinguishable — in message, in status, and in the time it takes —
   from a wrong password for an existing account.
4. **Given** repeated failed attempts against one address, **When** they exceed the stated
   rate, **Then** further attempts are refused for a period, and the refusal does not
   depend on whether the address exists.

---

### User Story 3 - Stay signed in, and leave deliberately (Priority: P2)

Someone who signed in yesterday opens the app today and is already in. When they choose to
sign out, they are signed out, and the next launch asks them to sign in.

**Why this priority**: P2 because the app already persists a credential across relaunches
(009), so part of this is inherited rather than built. It is separated because the *sign
out* half does not exist as a deliberate act today, and a session that cannot be ended is
a problem on a shared or lost device.

**Independent Test**: Sign in, force-stop the app, reopen it, and arrive at the feed
without being asked anything. Then sign out, reopen, and be asked to sign in.

**Acceptance Scenarios**:

1. **Given** a signed-in person, **When** the app is closed and reopened, **Then** they are
   still signed in and are not asked for anything.
2. **Given** a signed-in person, **When** they sign out, **Then** the stored credential is
   gone from the device and the next launch shows the sign-in screen.
3. **Given** a credential that has expired or been rejected, **When** the app makes a
   request with it, **Then** the person is returned to the sign-in screen with an
   explanation, rather than shown an empty feed.

---

### User Story 4 - Recover a forgotten password (Priority: P3)

Someone who cannot remember their password asks for a reset, receives an email, and
chooses a new password from the link in it.

**Why this priority**: P3 and **separately releasable**, because it is the only part of
this feature that needs an outside service to send mail. Blocking sign-up and sign-in
behind an email provider would hold the whole feature hostage to an account nobody has
opened yet. Until it ships, a forgotten password is unrecoverable, and the product must
say so rather than offer a control that does nothing.

**Independent Test**: Request a reset for a real address, follow the link in the email that
arrives, set a new password, and sign in with it.

**Acceptance Scenarios**:

1. **Given** an address with an account, **When** a reset is requested, **Then** an email
   arrives containing a single-use link that expires.
2. **Given** an address with no account, **When** a reset is requested, **Then** the
   response is identical to the one for an address that has an account, and no email is
   sent.
3. **Given** a valid reset link, **When** a new password meeting the floor is set, **Then**
   the old password no longer works and the link cannot be used a second time.
4. **Given** a reset link older than its stated lifetime, **When** it is followed, **Then**
   it is refused and the person is invited to request another.
5. **Given** a password is reset, **When** the reset completes, **Then** credentials issued
   before it stop working — a reset is what somebody does when they believe they have been
   compromised.

---

### Edge Cases

- **Two sign-ups for one email at the same instant.** Exactly one may succeed. A check
  followed by a write is not sufficient: it passes every sequential test and fails under
  the only circumstance it exists for.
- **An email address differing only in case or surrounding whitespace.** `Jo@Example.com `
  and `jo@example.com` are one address for the purpose of uniqueness and sign-in.
- **A person who signs up, then signs up again with the same address on another device.**
  Refused as already in use; this is not a second account.
- **A handle already held by an account that predates this feature.** Uniqueness is
  enforced by a claim record, and accounts predating this feature hold none — so the first
  human ever to choose a handle could take one that is already in use, which is the exact
  defect the constraint exists to prevent, reintroduced by the constraint's own rollout.
  FR-003 requires the existing set to be covered.
- **An account created by the device-token script**, which has no email and no password.
  It MUST keep working — the emulator journeys and the laptop runbook both depend on it —
  and it MUST NOT be reachable through sign-in, which has nothing to check.
- **A password reset requested for an address that signed up but never had an email
  delivered to it.** Handled as any other reset: the address is where the credential is
  recovered, so an address nobody controls is the account owner's problem to have avoided.
- **A sign-in attempt while the backend is unreachable.** Already covered by 009/FR-004 and
  must stay covered: the message names the address rather than saying "invalid".
- **Timing.** A refusal for an unknown address must not be measurably faster than a refusal
  for a known one with a wrong password.

## Requirements *(mandatory)*

### Functional Requirements

#### Creating an account

- **FR-001**: A person MUST be able to create an account from inside the app with an email
  address, a password they choose, a handle and a display name.
- **FR-002**: An email address MUST identify at most one account. Two simultaneous
  attempts to claim one address MUST NOT both succeed.
- **FR-003**: Handles MUST be unique. This **establishes** a guarantee rather than
  preserving one: research R1 proved by running it that nothing enforces handle uniqueness
  today, and that a duplicate *shadows* the original across thirteen call sites in six
  services. The constraint MUST cover handles that **already exist**, not only handles
  chosen from here on — a constraint that binds one half of the set does not make the set
  unique.
- **FR-004**: Email addresses MUST be compared for uniqueness and sign-in after trimming
  surrounding whitespace and folding case.
- **FR-005**: A password MUST meet a stated minimum length, and the requirement MUST be
  shown before submission rather than only in a refusal.
- **FR-006**: Creating an account MUST produce the same kind of person the product already
  has — a profile, a handle, a display name — so that every existing surface works for it
  with no change.
- **FR-007**: A sign-up refusal MUST name which field caused it and MUST preserve the rest
  of what was typed.

#### Signing in

- **FR-008**: A person MUST be able to obtain a credential by submitting the email address
  and password of an existing account.
- **FR-009**: A sign-in refusal MUST NOT reveal whether an account exists for the address
  given — not by message, not by status code, and not by how long it takes.
- **FR-010**: Sign-in and sign-up attempts MUST be rate limited, and the limit MUST NOT
  depend on whether the address exists.

#### Holding and discarding a credential

- **FR-011**: A credential MUST survive the app being closed and reopened, without the
  person re-entering anything.
- **FR-012**: A person MUST be able to sign out, which MUST remove the stored credential
  from the device.
- **FR-013**: When a credential is rejected, the app MUST return the person to sign-in with
  an explanation rather than rendering an empty or partial product.

#### Protecting the password

- **FR-014**: Passwords MUST NOT be stored in a form from which the original can be
  recovered.
- **FR-015**: Passwords MUST NOT appear in any log, any error, any response body, or any
  diagnostic output.
- **FR-016**: No endpoint MUST return a password or its stored form, in any shape, to any
  caller including the account's owner.
- **FR-017**: Verifying a password MUST NOT leak information through how long it takes.

#### Recovering a password *(separately releasable — see US4)*

- **FR-018**: A person MUST be able to request a password reset for their email address.
- **FR-019**: The response to a reset request MUST be identical whether or not an account
  exists for that address.
- **FR-020**: A reset link MUST be single-use and MUST expire.
- **FR-021**: Completing a reset MUST invalidate credentials issued before it.
- **FR-022**: Until reset is available, the app MUST NOT present a control that appears to
  offer it.

#### Not changing what a credential may see

- **FR-023**: This feature MUST make exactly **two** routes reachable without a credential
  through the MVP — sign-up and sign-in — and exactly **two more** when US4 ships:
  requesting a reset and completing one. Those two are necessarily public: a person who has
  forgotten their password holds no credential, so a reset route that demanded one could
  never be used by the only person who needs it. **No other route may move, in either
  direction, at any point.**
- **FR-024**: The visibility matrix MUST come out with the same surfaces and the same
  assertion count. This feature adds a way to obtain a credential; it changes nothing
  about what one permits.
- **FR-025**: The operator route snapshot MUST be unchanged. Creating an account MUST NOT
  be able to produce an operator.
- **FR-026**: Accounts created by the existing device-token tool MUST continue to work
  unchanged — **including after US4**, whose credential epoch has no value to compare for
  an account that holds no credential record. Verification MUST treat an absent epoch, on
  either side of the comparison, as verifying. Failing closed here would sign out the
  emulator journeys and the laptop runbook in one commit, which is the one population of
  accounts the product currently depends on.

#### The app

- **FR-027**: The sign-in screen MUST open asking for an email address and a password, not
  for a token or a server address.
- **FR-028**: A person MUST be able to move between signing in and creating an account
  without losing what they have typed in the field common to both.
- **FR-029**: The server address MUST remain reachable from the app for the case where a
  compiled-in address stops being correct, and MUST NOT be part of the ordinary path.

### Key Entities

- **Account credential**: What proves a person may act as a given user. Holds the email
  address that identifies it and a non-recoverable representation of the password. Belongs
  to exactly one person; a person has at most one.
- **Person**: Unchanged. The existing profile — handle, display name, counts, preferences —
  which every other surface already reads. This feature gives it a way to be reached; it
  adds nothing to it.
- **Reset request** *(US4)*: A single-use, expiring permission to choose a new password for
  one account, addressed to the email that account is identified by.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person who has never used the product can go from opening the app to seeing
  a feed **without being shown a token or a server address at any point**.
- **SC-002**: Account creation completes in **under 60 seconds** for somebody typing at an
  ordinary pace, measured from the first field to the first screen of content.
- **SC-003**: A person who signed in yesterday opens the app today and reaches their feed
  **without entering anything**.
- **SC-004**: A refusal for an address with no account is **indistinguishable** from a
  refusal for a wrong password — same message, same status, and within a margin that does
  not separate them in timing.
- **SC-005**: Two simultaneous sign-ups for one email address produce **exactly one**
  account, demonstrated under genuine concurrency rather than in sequence.
- **SC-006**: The visibility matrix reports the **same surface count and the same assertion
  count** as before this feature.
- **SC-007**: The public route snapshot gains **exactly two** entries through the MVP and
  **exactly four** once US4 ships, and loses none at any point; the operator snapshot is
  unchanged throughout.
- **SC-008**: No password, and no stored form of one, appears anywhere in the application's
  output — searched for, not assumed.
- **SC-009** *(US4)*: A person who has forgotten their password can be signing in again
  **within five minutes**, without contacting anybody.

## Assumptions

These are decisions taken in the absence of a stated requirement, recorded so that a reader
meets them here rather than as a surprise in the build.

- **A verified email address is not required to use the product, and is required to reset
  a password.** Requiring verification before posting would block account creation behind
  an email provider nobody has opened an account with yet. Reset is the one operation that
  genuinely trusts the address, and it is where the address has to be real. The consequence
  is stated plainly: an account may hold an address its owner never consented to, and the
  remedy available to that owner is to reset the password and take the account over — which
  is a reasonable outcome rather than an exploit.
- **One long-lived credential, discarded on sign-out, rather than short access tokens with
  refresh.** The device already persists a credential across relaunches and the product
  already treats a rejected one as "sign in again". Refresh tokens would be a second
  mechanism serving a requirement nobody has stated. The cost is that a stolen credential
  is useful for its whole life, which is why FR-021 makes a reset invalidate outstanding
  ones.
- **Existing device-token accounts are not migrated and cannot be adopted.** They have no
  email, so sign-in has nothing to check. They keep working with the credential they have,
  which is what FR-026 requires; joining one to an email address is a linking flow nobody
  has asked for.
- **Identity stays on this project's own issuer.** A managed identity service would mean
  the product verifies its tokens in production and local ones in tests — two
  implementations selected by configuration, which is the shape the four AWS adapters were
  deleted for and the reason every test would exercise the one that does not ship.
- **The minimum password length is 10 characters**, with no composition rules. Length
  dominates character-class requirements for resistance to guessing, and composition rules
  mostly produce predictable substitutions.
- **Email delivery is out of scope for everything except US4**, and US4 is releasable on
  its own precisely so the rest is not held up by it.
- **Rate limits use the mechanism the product already has** rather than introducing one.
- **The cold start (007/FR-014) follows account creation**, because a new account has
  declared nothing and that is exactly the state the cold start exists for.
