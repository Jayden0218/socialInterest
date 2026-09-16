# Feature Specification: The App Says What It Is Doing

**Feature Branch**: `claude/pensive-goldberg-jjjni5`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "the ui is very bad, and there is no a complete and full flow for each"

## Why this exists

The owner installed the app and said the interface is bad and the flows are incomplete. That
is a judgement about the product, and the measurements underneath it are not in dispute:

| Surface | Loading state | Empty state | Pull to refresh |
|---|---|---|---|
| **Feed** — the first screen after signing in | **none** | yes | **none** |
| **Explore** | **none** | **none** | **none** |
| **Activity** | **none** | **none** | **none** |
| **Chats** | **none** | yes | **none** |
| Profile | yes | yes | **none** |

**14 of 25 screens have no loading state. The app contains no pull-to-refresh at all.**

So on four of the five primary surfaces, "still loading", "nothing here yet" and "that
failed" are the same blank rectangle, and there is no way to ask for fresh content. An
interface that shows nothing while it works does not read as slow — it reads as broken,
which is exactly what was reported.

**Two further findings, of a kind this project has recorded seven times**: `people-search`
is a declared route with no renderer and no caller — a screen specified, typed, and
reachable by no path — and `create-place` is nearly the same.

**And one that is not a UI problem at all.** A social product with one account shows an
empty feed forever. `pnpm seed:demo` populates six people and fourteen posts for a
developer; nothing does anything equivalent for a real new account. No amount of visual
work fixes a screen whose honest content is nothing.

This feature adds **feedback** and closes **paths**. It changes nothing about what anybody
may see.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The app tells me it is working (Priority: P1)

Someone opens a surface that has to fetch something. While it fetches they see the shape of
what is coming. If it arrives, they see it. If there is nothing, they are told so and told
what to do about it. If it fails, they are told that, and can try again.

**Why this priority**: It is the whole of the reported complaint that can be fixed without
deciding anything new, it touches every screen, and it is the difference between an app
that seems broken and one that seems slow. Independently valuable: with only this, the app
stops looking broken.

**Independent Test**: Open each primary surface on a slow connection and confirm that at no
point is the screen blank and unexplained.

**Acceptance Scenarios**:

1. **Given** a surface whose content has not arrived, **When** a person looks at it,
   **Then** they see a placeholder shaped like the content that will replace it, and never
   an empty screen.
2. **Given** a surface with genuinely nothing to show, **When** it finishes loading,
   **Then** it says so and offers the control that would change that.
3. **Given** a request that fails, **When** it fails, **Then** the person is told it failed
   and offered a retry, and this is distinguishable from there being nothing.
4. **Given** any of those three states, **When** a person compares them, **Then** no two of
   them look the same.
5. **Given** a list of content, **When** a person pulls down on it, **Then** it refreshes
   and says that it is refreshing.

---

### User Story 2 - Every journey finishes (Priority: P1)

Someone performs each thing the product claims to do, start to finish, in one sitting,
without knowing anything about the code.

**Why this priority**: P1 alongside US1 because it is the second half of the report. A
screen that gives good feedback and then strands you is not better than one that does not.

**Independent Test**: Walk every journey as a person rather than as a test, writing down
the first point at which you cannot continue. That list is the work.

**Acceptance Scenarios**:

1. **Given** any screen the app declares, **When** the declared routes are enumerated,
   **Then** each one is reachable from somewhere, or it does not exist.
2. **Given** a person who wants to find somebody, **When** they look for a way to do it,
   **Then** there is one and it works.
3. **Given** any journey the product claims, **When** a person performs it end to end,
   **Then** they are never blocked by a missing control, a screen with no way in, or a
   screen with no way out.
4. **Given** a pushed screen, **When** a person wants to leave it, **Then** there is a way
   back that does not depend on the device's own gesture.

---

### User Story 3 - A new account is not an empty room (Priority: P2)

Someone who has just created an account arrives at a feed with something in it, or is told
plainly why it is empty and what would fill it.

**Why this priority**: P2 because it is the largest in scope and the least contained — it
touches what the product IS, not only how it reports itself. But it is the reason the first
two are not sufficient: a perfectly stated empty state is still an empty product.

**Independent Test**: Create an account on an installation with no other content, and see
whether there is anything to do.

**Acceptance Scenarios**:

1. **Given** a brand new account, **When** the person reaches their feed, **Then** they are
   not shown an unexplained blank screen.
2. **Given** a feed with nothing in it, **When** the person looks at it, **Then** it names a
   next action that is available to them and that would change the state.
3. **Given** a person who takes that action, **When** they return to the feed, **Then** the
   feed reflects what they did.

---

### User Story 4 - The states look like the rest of the product (Priority: P3)

The placeholders, empty states and failures are recognisably part of the same app as the
screens they stand in for.

**Why this priority**: P3 and deliberately last. It is the part most easily mistaken for the
whole request, and doing it first would put polish on top of blank screens. The approved
design does not cover these states, so they are the one place new visual decisions are
needed — and they must extend the existing language rather than start a second one.

**Independent Test**: Put a loading, empty and failed state beside the artboard for the same
screen and confirm they read as the same product.

**Acceptance Scenarios**:

1. **Given** a state the approved design does not cover, **When** it is designed, **Then**
   it uses the existing tokens, spacing and type scale and introduces no new ones.
2. **Given** an implemented screen and its artboard, **When** they are compared, **Then**
   differences are recorded as either drift to be fixed or as a state the artboard does not
   cover.

---

### Edge Cases

- **A request that fails instantly.** A placeholder that appears and vanishes within a few
  hundred milliseconds is a flash of noise, worse than nothing. Below a threshold, show
  nothing rather than a flicker.
- **A request that never returns.** A placeholder shown forever is a blank screen wearing a
  costume. There is a point at which a pending request must be reported as failed.
- **An empty state whose suggested action is unavailable to that person.** Telling somebody
  to publish something when they cannot is worse than saying nothing.
- **A refresh that returns exactly what was already there.** It must still visibly conclude,
  or the gesture reads as broken.
- **A refresh triggered while one is already running.** Must not stack.
- **An empty list that is empty because of a block or a privacy rule.** The empty state must
  not explain why, because the boundary deliberately makes absence and refusal
  indistinguishable. This is the one place a less helpful message is the correct one.
- **A route that is unreachable because the feature was never finished**, rather than by
  oversight. Deleting it and building it are both valid; leaving it declared is not.

## Requirements *(mandatory)*

### Functional Requirements

#### Telling the person what is happening

- **FR-001**: Every surface that fetches content MUST distinguish four states a person can
  tell apart: loading, empty, failed, and content.
- **FR-002**: No surface may present an unexplained blank screen in any state.
- **FR-003**: A content surface MUST indicate loading with a placeholder shaped like the
  content that will replace it, not with an unanchored spinner.
- **FR-004**: A short discrete action MAY indicate progress with a spinner; a content
  surface may not.
- **FR-005**: A loading indicator MUST NOT appear for a request that resolves faster than a
  stated threshold.
- **FR-006**: A request pending beyond a stated limit MUST be reported as failed rather than
  shown as loading indefinitely.

#### Empty and failed

- **FR-007**: An empty state MUST name an action that would change the state, and offer the
  control that performs it.
- **FR-008**: An empty state MUST NOT offer an action unavailable to that person.
- **FR-009**: A failure MUST be distinguishable from emptiness by a person, not only by a
  developer.
- **FR-010**: A failure MUST offer a retry that re-attempts the request that failed.
- **FR-011**: An empty state caused by the visibility boundary MUST NOT reveal that a
  boundary was the cause.

#### Refreshing

- **FR-012**: Every list a person would expect to refresh MUST be refreshable by pulling
  down on it.
- **FR-013**: A refresh in progress MUST be visible, and MUST visibly conclude even when
  nothing changed.
- **FR-014**: A refresh requested while one is running MUST NOT start a second one.

#### Finishing the journeys

- **FR-015**: Every route the app declares MUST be reachable by at least one path from a
  place a person can get to, or MUST be removed.
- **FR-016**: A person MUST be able to find another person from inside the app.
- **FR-017**: Every journey the product claims MUST be completable end to end in one sitting
  by somebody who has not read the code.
- **FR-018**: Every pushed screen MUST offer a way back that does not rely on a platform
  gesture.

#### A new account

- **FR-019**: A newly created account MUST NOT be shown an unexplained empty feed.
- **FR-020**: Where a new account's feed is empty, the product MUST state why and offer a
  next action that is available to that person.
- **FR-021**: Taking that action MUST visibly change what the feed shows.

#### Changing nothing about what is visible

- **FR-022**: The visibility matrix MUST come out with the same surfaces and the same
  assertion count. This feature adds feedback; it changes no permission.
- **FR-023**: The public and operator route snapshots MUST NOT move.
- **FR-024**: No state introduced by this feature may display content the boundary would
  have withheld.

#### Looking like the product

- **FR-025**: States not covered by the approved design MUST be built from the existing
  tokens, spacing and type scale, introducing no second visual language.
- **FR-026**: Where an implemented screen has drifted from its artboard, the artboard
  governs, and the drift MUST be recorded rather than silently accepted.

### Key Entities

- **Surface state**: Which of loading, empty, failed or content a surface is currently in.
  Exactly one at a time, and each visually distinct from the others.
- **Empty-state action**: The thing a person can do about an empty surface — a description
  and the control that performs it. An empty state without one is a report rather than a
  remedy.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Zero** surfaces present an unexplained blank screen in any of the four
  states — counted mechanically, across every screen, not sampled.
- **SC-002**: Every primary surface can be refreshed by pulling down, and the refresh
  visibly concludes.
- **SC-003**: **Zero** declared routes are unreachable.
- **SC-004**: A person who has not read the code completes every claimed journey end to end
  without assistance, and the count of journeys where they could not is **zero**.
- **SC-005**: A newly created account reaches a feed that either holds content or explains
  itself and offers an action — never a blank screen.
- **SC-006**: The visibility matrix reports the **same surface count and the same assertion
  count** as before this feature.
- **SC-007**: The public route snapshot and the operator route snapshot are **unchanged**.
- **SC-008**: Loading, empty and failed states for a given surface are distinguishable from
  one another by somebody who has not been told which is which.

## Assumptions

Decisions taken in the absence of a stated requirement, recorded so a reader meets them here
rather than as a surprise in the build.

- **The complaint is about feedback and completeness before it is about aesthetics.** The
  measurements support that reading: an app blank on four of five surfaces with no refresh
  anywhere will be called bad regardless of its palette. If seeing the screens shows the
  visual layer is also wrong, that is a finding for US4 and possibly a separate feature —
  not a reason to reorder this one.
- **The approved design is not reopened.** `design/007-ui/` is settled. This feature
  implements it, records drift from it, and designs only the states it does not cover.
- **A placeholder threshold of around 200ms and a failure limit of around 15 seconds.** Both
  are conventional rather than measured, and both are named in one place so they can be
  changed by somebody who disagrees.
- **"Every journey the product claims" means the journeys already written down** in the
  existing feature specs, not a new inventory. If walking them reveals a journey nobody
  wrote down, that is a finding.
- **Seeded demonstration content is a development tool and not the answer to US3.** What a
  real new account gets is a product decision this feature must make explicitly, not borrow
  from a seeding script.
- **Device verification is not available.** No emulator runs in the current sandbox and
  nothing in 011 has yet run on a device. Every claim this feature makes must be made at the
  tier that can support it, and the device tier must be reported **not run** rather than
  assumed — which is also why the first work is to look at the screens rather than to start
  changing them.
