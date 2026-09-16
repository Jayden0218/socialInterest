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
| **Explore** | **none** | yes | **none** |
| **Activity** | **none** | yes | **none** |
| **Chats** | **none** | yes | **none** |
| Profile | yes | yes | **none** |

**No primary surface has a loading state. The app contains no pull-to-refresh at all.**

> **CORRECTED AFTER LOOKING (research R1).** The first draft of this table said Explore and
> Activity had no empty state, from a grep of `screens/*Container.tsx`. The containers
> fetch; the **screens render**, and every one of them has a good empty state — Activity
> says "Nothing new / You are all caught up." The grep was truthful about the wrong files,
> which is the same shape as a guard reading a barrel and finding no offenders. The loading
> and refresh columns survived the check; the empty column did not.

So on every primary surface, "still loading" and "that failed" are the same blank
rectangle, and there is no way to ask for fresh content. An interface that shows nothing
while it works does not read as slow — it reads as broken.

**And the captures found something the grep could not.** Every photograph in the feed is a
blank grey box, with no placeholder while it loads and no indication when it fails — the
four-state rule applied to an image rather than a screen, on a product whose premise is
photographs. Every post also shows `♥ 0 · 0`. A feed of entirely unengaged posts reads as
abandoned however well it is laid out, and no state or palette fixes that.

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

### User Story 4 - The app looks like an app (Priority: P1)

Someone opening this beside the other applications on their phone sees something of the same
kind, not a prototype.

**Why this priority**: **Raised from P3 to P1 by the owner, twice, and they were right.**
The research first concluded the visual design was sound because it matched the approved
artboards — but an implementation cannot be found wanting against a design that shares its
deficiency, and the owner was comparing against every other app on their phone, which is the
better reference. The measurement that settles it is not a matter of taste: **this
application contains no icons of any kind.** Five navigation destinations are drawn as an
eight-pixel dot above a word; a reaction is the character `♥`; a comment count is a bare
number. None of the US1 work touches any of that.

**Independent Test**: Put this app's tab bar and a post card beside any mainstream social
application and ask somebody which one is finished.

**Acceptance Scenarios**:

1. **Given** the navigation bar, **When** a person looks at it, **Then** each destination is
   an icon with a label, drawn from one consistent set — not a dot.
2. **Given** an action anywhere in the product — react, comment, share, save, back, search,
   compose — **When** it is presented, **Then** it uses an icon from that same set, at a
   consistent size, weight and treatment.
3. **Given** a post card, **When** it is laid out, **Then** the photograph is the dominant
   element and the metadata around it is subordinate to it.
4. **Given** any two screens, **When** their spacing and type are compared, **Then** both
   come from the one scale and neither introduces a value of its own.

---

### User Story 5 - The app suggests, instead of waiting (Priority: P2)

Someone who does not yet know what they want is shown something worth looking at, on every
surface, before they type anything.

**Why this priority**: the second half of the owner's report — "the flow of the user to be
easy". Every screen in the product currently waits to be driven. Explore opens with two
empty text fields and asks you to type before it shows anything; the interest list is twelve
names and twelve dots with nothing to say how much is behind any of them; nothing anywhere
prompts a newcomer toward the thing they should do next. Each screen works and the path
through them is still hard.

**Independent Test**: Hand the app to somebody who has never seen it, say nothing, and watch
where they stop.

**Acceptance Scenarios**:

1. **Given** the Explore tab, **When** a person opens it, **Then** it shows something worth
   looking at before any text is typed.
2. **Given** a browsable list of interests, **When** a person reads it, **Then** each entry
   conveys how much is behind it, so choosing is not guessing.
3. **Given** a person who has just arrived, **When** they look at any primary surface,
   **Then** there is a next action visible without scrolling.
4. **Given** a person who wants to find somebody by name, **When** they look for a way,
   **Then** there is one, from a place they would think to look.

---

### User Story 6 - The states look like the rest of the product (Priority: P3)

The placeholders, empty states and failures introduced by US1 are recognisably part of the
same app as the screens they stand in for.

**Why this priority**: P3, and only now that US4 has established what "the rest of the
product" is going to be. Designing states to match a visual language that is itself being
replaced would be work done twice.

**Independent Test**: Put a loading, empty and failed state beside the finished design for
the same screen and confirm they read as one product.

**Acceptance Scenarios**:

1. **Given** a state the design does not cover, **When** it is designed, **Then** it uses the
   established tokens, spacing and type scale and introduces no new ones.
2. **Given** an implemented screen and its design, **When** they are compared, **Then**
   differences are recorded as drift to be fixed or as a state the design does not cover.

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

- **FR-006a**: An image MUST indicate that it is loading, and MUST indicate when it has
  failed. A photograph that never arrives may not be indistinguishable from one that is
  still on its way, and neither may be indistinguishable from an empty frame. (Research R3 —
  every image in the captures is the same grey box in all three cases.)

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

#### Looking like an app

- **FR-027**: The product MUST have one icon set, and every action and navigation
  destination MUST draw from it. No action may be represented by a typographic character
  standing in for an icon.
- **FR-028**: Every navigation destination MUST be an icon with a label.
- **FR-029**: Icons MUST be consistent in size, weight and treatment across the product. A
  set that varies per screen is the defect this requirement exists to prevent, not a
  lesser version of meeting it.
- **FR-030**: On a post, the photograph MUST be the dominant element and its metadata
  subordinate to it.

#### Suggesting rather than waiting

- **FR-031**: A discovery surface MUST show content before any input is given.
- **FR-032**: A browsable list of interests MUST convey how much is behind each entry.
- **FR-033**: Every primary surface MUST offer a visible next action without scrolling.

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
- **SC-009**: **Zero** actions or navigation destinations are represented by a typographic
  character or an undifferentiated shape. Counted mechanically across the product.
- **SC-010**: Somebody who has never seen the app, given no instructions, reaches a piece of
  content worth looking at without typing anything.
- **SC-011**: Shown this app's navigation bar and a mainstream social application's, a
  person not told which is which does not identify this one as unfinished.

## Assumptions

Decisions taken in the absence of a stated requirement, recorded so a reader meets them here
rather than as a surprise in the build.

- **The complaint is about feedback and completeness before it is about aesthetics — and
  this was checked rather than assumed.** Research R2 rendered the screens: the palette,
  spacing, type and card layout are coherent and match `design/007-ui`. The visual layer is
  **not** what is wrong. Two things the assumption did not anticipate came out of looking:
  images render as blank grey boxes with no state of their own (now FR-006a), and Explore is
  genuinely the weakest screen in the product (research R5) on the tab a lost newcomer
  presses first. The second is a US4 item and its priority is a judgement for the plan
  rather than the automatic last place this spec first gave it.
- **`design/007-ui/` IS reopened, by the owner, deliberately.** CLAUDE.md records it as
  approved and not to be revisited. The owner has said twice that the result is bad and has
  asked for a redesign learning from mainstream social applications, which is their call to
  make. The artboards remain the reference for everything this feature does not explicitly
  replace — palette, ground, card idiom — and the replacement is bounded by US4's
  requirements rather than open-ended.
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
