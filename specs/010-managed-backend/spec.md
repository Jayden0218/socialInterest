# Feature Specification: A Backend That Stays Up

**Feature Branch**: `claude/pensive-goldberg-jjjni5`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "I want a real backend with accounts that persist. Everything must stay free, and I will not put a credit card anywhere."

## Why This Exists

009 gave the product a backend a phone can reach. It lasts thirty minutes and starts
empty every time.

That is enough to look at the app and not enough to *use* it. A post published on Monday
should be there on Tuesday. An account should outlive the afternoon it was created in. Every
feature after this one — identity above all — is meaningless without it, because an account
that evaporates is not an account.

**The constraint that shapes every decision here is the owner's, stated twice and not
negotiable: no credit card, anywhere.** That rules out every hosted service that speaks the
datastore API this product currently uses, because all of them are reached through a cloud
account that takes a card even when nothing is ever charged. So the datastore changes. That
is the price, it is being paid deliberately, and `research.md` D3 already recorded that the
replacement was the better technical fit before cost ever entered into it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - What I publish is still there tomorrow (Priority: P1)

The owner publishes a post. They close the app, and come back the next day. The post is
there, with its photograph, its caption and its comments.

**Why this priority**: It is the whole feature, and everything else depends on it. It is also
valuable before anything is deployed anywhere — a datastore that survives a restart on a
developer machine is the same datastore that survives a week in a managed service, and
proving the first is how the second becomes credible.

**Independent Test**: Publish a post. Stop every process and container. Start them again.
The post is there, unchanged, and so is everything attached to it.

**Acceptance Scenarios**:

1. **Given** a published post with a photograph, **When** everything is restarted, **Then** the post, its caption, its media and its counts are unchanged.
2. **Given** a write that must be all-or-nothing, **When** part of it fails, **Then** none of it is applied.
3. **Given** two people acting at once, **When** both change the same counter, **Then** the count reflects both.
4. **Given** the product's existing rules about who may see what, **When** the datastore changes underneath them, **Then** not one of those answers changes.

---

### User Story 2 - My photographs survive too (Priority: P2)

A post is its picture. Media has to outlive the session as surely as the caption does.

**Why this priority**: Second because a datastore that persists while media does not is a
half-working product, but the datastore is the harder problem and the one everything else
sits on. Independently testable and independently valuable.

**Independent Test**: Publish a post carrying a photograph. Restart everything. The
photograph still renders.

**Acceptance Scenarios**:

1. **Given** a published photograph, **When** everything is restarted, **Then** it still renders.
2. **Given** a viewer who may not see a post, **When** they obtain its media address, **Then** it does not serve them the file.
3. **Given** a media address, **When** enough time passes, **Then** it stops working.

---

### User Story 3 - One address, and it stops changing (Priority: P3)

The owner points the app at the product once. It keeps working — tomorrow, next week, from
any network — without being told a new address.

**Why this priority**: The most visible improvement and the least independent: it needs both
stories above to mean anything. A permanent address in front of an empty datastore is a
prettier version of what 009 already does.

**Independent Test**: Point the app at the address. Use it. Come back a week later, from a
different network, without touching the address field.

**Acceptance Scenarios**:

1. **Given** the app is pointed at the product, **When** a week passes, **Then** it still reaches it without being reconfigured.
2. **Given** a phone on any network, **When** it opens the app, **Then** the connection is encrypted.
3. **Given** the product is running, **When** nobody has used it for a long time, **Then** the next request is still served.

---

### Edge Cases

- **The free allowance fills up.** Storage and database both have ceilings. The product must fail in a way that says so, rather than corrupting or silently discarding what somebody published.
- **A limit that was protecting something disappears.** A group is capped at twenty people because the old datastore could not write more in one all-or-nothing operation. The new one can. **The cap must not silently change**, because it is now a product decision rather than a technical one, and nobody has decided it.
- **Nothing needs migrating, and that must be confirmed rather than assumed.** Every datastore this product has ever had was disposable — local, or a thirty-minute session. If that is true there is no migration; if any real data exists, this is the moment to find out.
- **Credentials rotate.** The password to the datastore will change one day. Nothing may stop working in a way that requires a rebuild of the app.
- **The host restarts underneath a request.** Managed hosting moves processes. An interrupted write must not leave a post half-published.
- **A photograph is uploaded and its post is never published.** Storage fills with orphans unless something notices.

## Requirements *(mandatory)*

### Functional Requirements

#### The datastore (US1)

- **FR-001**: Data MUST survive the restart of every process, container and host involved.
- **FR-002**: The datastore MUST be reachable without any payment method being on file anywhere.
- **FR-003**: Every access pattern the product already relies on MUST keep working. The scheme that identifies and orders items is NOT redesigned by this feature.
- **FR-004**: A write the product requires to be all-or-nothing MUST remain all-or-nothing.
- **FR-005**: Increasing or decreasing a count MUST be atomic, so that two people acting at once cannot lose one another's change.
- **FR-006**: **Not one visibility, authentication or privacy answer may change.** This feature changes where data is kept and nothing else.
- **FR-007**: The full test suite MUST run with no credentials for any hosted service, so that a contributor with no accounts can verify the product.

#### Media (US2)

- **FR-008**: Published media MUST survive the same restarts as FR-001.
- **FR-009**: Media MUST be served through addresses that expire, and that are issued only after the boundary has decided this viewer may see this post.
- **FR-010**: The address media is served from MUST be configurable independently of the application's own address.

#### Being reachable (US3)

- **FR-011**: The product MUST be reachable at an address that does not change between uses.
- **FR-012**: That address MUST be encrypted.
- **FR-013**: The product MUST run where no container runtime is available to it. Media processing may not depend on starting another container.
- **FR-014**: Hosting MUST require no payment method.
- **FR-015**: The product MUST remain usable after a period of no use, without manual intervention.

#### Keeping the keys safe

- **FR-016**: No credential may be committed to the repository, and this MUST be enforced by something that fails the build rather than by care.
- **FR-017**: A credential MUST be replaceable without rebuilding or reinstalling the app.

### Key Entities

- **The datastore**: Where everything the product knows is kept. Persistent, reachable without a payment method, and addressed by the same scheme the product already uses.
- **Media storage**: Where photographs and video are kept. Persistent, private, and served only through expiring addresses.
- **The product's address**: One stable, encrypted address the app is pointed at, independent of where anything is hosted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A post published with a photograph on one day is readable, with its photograph, **at least seven days later**, having touched nothing in between.
- **SC-002**: The full test suite passes with **zero** credentials for any hosted service.
- **SC-003**: The visibility decision table is **unchanged**: the same number of surfaces, the same number of assertions, all passing.
- **SC-004**: **Zero** payment methods are on file with any provider used, verified by inspection.
- **SC-005**: The app reaches the product for **seven days** without its address being changed.
- **SC-006**: **Zero** blank media on any surface. Every image either renders or reports a failure.
- **SC-007**: Publishing a post carrying a photograph completes in **under 30 seconds** on the deployed product, measured from the phone.
- **SC-008**: After **24 hours** of no use, the first request is served in under **60 seconds**.

## Assumptions

- **The free allowances are enough for the owner and a small number of people, and not for a product with real users.** Roughly 500 MB of structured data and 1 GB of media. This is a stated ceiling, not an oversight, and the feature is not complete if it hides it.
- **There is nothing to migrate.** Every datastore to date has been local or a thirty-minute session. To be confirmed, not assumed — see Edge Cases.
- **The twenty-person group cap stays as it is.** Its technical reason disappears with this feature; the product decision has not been made and this feature does not make it.
- **The owner holds the accounts.** Any account is created by the owner and its credentials never pass through a transcript or an agent session.
- **One deployment, not many.** No staging environment, no regions, no blue-green.

## Out of Scope

- **Identity.** Email and password sign-in is the next feature and depends on this one. This feature does not change how anyone signs in.
- **Migrating existing data**, per the assumption above.
- **Scale.** Nothing here is sized for real users, and the allowances above say so.
- **iOS.** Nothing has ever run there and this does not change it.
- **Deciding the group cap.** Named in Edge Cases so it is not changed by accident.
