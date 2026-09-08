# Feature Specification: Ranked Feed and App Redesign

**Feature Branch**: `claude/spec-kit-integration-juhrza`

**Created**: 2026-09-08

**Status**: Draft

**Governing constitution**: **2.0.0** (amended 2026-09-08). This feature is the reason
Principle I was amended. It MUST NOT be planned against version 1.0.0.

**Input**: User description: replace the interest-composed home feed with one blended
stream ranked from behaviour, and rebuild every screen in the approved design
(`design/007-ui/`, 20 artboards).

## What this feature replaces

The home feed is currently **composed** from the interests a person follows. After this
feature it is **ranked**: one blended stream, no sections, ordered by what the person is
likely to want, learned from what they do.

This is a change of product premise, and it withdraws requirements rather than extending
them. The withdrawals are listed in **Removed Scope** below and each has a task; an
invalidated requirement that is merely ignored still reads as a promise.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A feed that gets better the more I use it (Priority: P1)

Somebody opens the app and sees a two-column waterfall of posts. There are no sections and
nothing explaining why any post is there. They scroll, linger on some, tap a few, save one.
Next time they open it, more of what they lingered on is near the top.

**Why this priority**: It is the feature. Everything else here supports it.

**Independent Test**: Sign in, record a session in which one interest's posts are opened
and dwelt on and another's are skipped, then request the feed again and assert the ranking
moved in the direction of the signals. Testable without any redesign work.

**Acceptance Scenarios**:

1. **Given** a person with recorded signals favouring one interest, **When** they load
   their feed, **Then** posts from that interest appear earlier than posts from an
   interest they have consistently skipped.
2. **Given** a person who has just signed up and picked three interests, **When** they load
   their feed for the first time, **Then** it is populated from those three interests and
   is not empty.
3. **Given** a post whose author has blocked the viewer, **When** the ranking selects it as
   a candidate, **Then** the viewer does not receive it.
4. **Given** a post that its author switches to private, **When** the viewer reloads any
   surface, **Then** it is absent immediately, with no stale ranked copy.
5. **Given** a person scrolling the feed, **When** they reach the end of the loaded set,
   **Then** more posts load without a visible interruption.

---

### User Story 2 - I can see what my feed is built from, and reset it (Priority: P1)

A person opens Settings and finds a plain-language account of what their feed is ranked
from, and a control that clears it. After clearing, the feed returns to the interests they
originally picked.

**Why this priority**: P1 and not P2. Constitution 2.0.0 Principle I states that a ranking
which cannot be inspected or reset is not permitted, and Principle III requires behavioural
collection to be disclosed somewhere findable. This ships with US1 or US1 does not ship.

**Independent Test**: Open Settings, read the disclosure, clear the signals, and assert the
signal store for that person is empty and the feed falls back to the seed interests.

**Acceptance Scenarios**:

1. **Given** a person with recorded signals, **When** they open Settings, **Then** they can
   read what their feed is built from without being told where to look for it.
2. **Given** a person with recorded signals, **When** they clear them, **Then** the signals
   are gone and the feed is ranked as it was for a new account with the same seed interests.
3. **Given** any person, **When** they view another person's profile or any public surface,
   **Then** nothing there reveals what that person has dwelt on, opened, or saved.

---

### User Story 3 - The app I open forty times a day (Priority: P2)

Every screen is rebuilt in the approved design: one typeface, one accent, no shadows,
interests as coloured words, a two-column waterfall feed. Twenty screens, one language.

**Why this priority**: P2 because US1 and US2 can ship on the existing screens and still be
a working product. The redesign is what makes it one somebody chooses to use.

**Independent Test**: Drive every screen and compare against the twenty artboards; run the
existing journeys unchanged.

**Acceptance Scenarios**:

1. **Given** any screen in the app, **When** it is rendered, **Then** it uses one typeface
   and one accent colour, and casts no shadow.
2. **Given** the feed, **When** it renders posts of differing image heights, **Then** the
   two columns stagger and four or more posts are visible without scrolling.
3. **Given** a person who has increased the platform font size, **When** they open any
   screen, **Then** text grows and no control becomes unreachable or clipped.
4. **Given** any interactive control, **When** it is measured, **Then** it is at least
   44x44 points.

---

### User Story 4 - Interests are still how I find things (Priority: P2)

A person taps the interest under a post and lands in that interest's space: its posts, its
sub-interests, its description. Search still finds interests, places and people, typed
separately.

**Why this priority**: Constitution 2.0.0 keeps interests load-bearing. Without this the
ranked feed leaves the taxonomy vestigial, which is the exact failure Principle I names.

**Independent Test**: From a post in the feed, reach the interest space in one tap and
assert it lists that interest's posts including those rolled up from sub-interests.

**Acceptance Scenarios**:

1. **Given** a post in the feed, **When** the viewer taps its interest, **Then** the
   interest space for that interest opens.
2. **Given** a top-level interest with sub-interests, **When** its space is opened,
   **Then** posts from its sub-interests are included and the roll-up is stated.
3. **Given** a search term, **When** results return, **Then** interests, places and people
   are presented as distinguishable kinds.

---

### User Story 5 - Publishing something, and being able to report it (Priority: P2)

Publishing takes photos or video, a caption, and **an interest, which cannot be skipped**.
Any post can be reported, and any person blocked, from a sheet that is reachable on the
shortest screen the product supports.

**Why this priority**: The interest requirement is Principle I's first clause. The safety
path is Principle IV, a release gate.

**Independent Test**: Attempt to publish without an interest and assert refusal; open the
safety sheet on a 640pt-tall screen and reach the block control.

**Acceptance Scenarios**:

1. **Given** a draft post with media and a caption but no interest, **When** the person
   tries to publish, **Then** publishing is refused and the missing interest is named.
2. **Given** any post by another person, **When** the viewer opens the safety sheet,
   **Then** both a report reason list and a block control are reachable, on a screen 640
   points tall, without any control being unreachable.
3. **Given** a submitted report, **When** it is accepted, **Then** it enters the moderation
   queue and the sheet closes.

---

### Edge Cases

- **A brand-new account with no signals and no picks.** If cold start is skipped or
  abandoned, the feed MUST still return posts rather than an empty screen.
- **A person whose every signal is for one interest.** The feed MUST NOT become that
  interest alone; some proportion of each response MUST come from outside the person's
  established signals, or the feed narrows to nothing and cannot recover.
- **Signals recorded against a post that is later deleted, hidden, or whose author blocks
  the viewer.** The signal survives as a preference; the post MUST NOT reappear.
- **A dwell measurement taken while the app is backgrounded or the screen is locked.** It
  MUST NOT count as attention.
- **A person who clears their signals mid-session.** The next feed request MUST reflect the
  cleared state, not a cached ranking.
- **Ranking unavailable.** If the ranking cannot be produced, the feed MUST fall back to a
  visible, defensible ordering rather than an error screen.
- **An interest with no posts.** Its space MUST say so distinctly from a search that
  matched nothing.
- **Platform font at its largest setting on the shortest supported screen**, on the safety
  sheet specifically — the case that reached production once before.

## Requirements *(mandatory)*

### Functional Requirements

**The ranked feed**

- **FR-001**: The home feed MUST be a single blended stream. It MUST NOT be grouped,
  sectioned, or otherwise divided by interest.
- **FR-002**: Feed order MUST be produced by a ranking over candidate posts, using signals
  recorded from the viewer's own behaviour.
- **FR-003**: The system MUST record, per viewer: which posts were opened, how long each
  was displayed, which were liked, and which were saved.
- **FR-004**: A dwell measurement MUST only count time during which the post was actually
  on screen and the app in the foreground.
- **FR-005**: Ranking MUST select and order **candidates only**. Every ranked result set
  MUST pass through the single visibility boundary, at read time, before reaching a viewer.
  (Constitution 2.0.0, Principle II.)
- **FR-006**: A change to a post's visibility MUST take effect on every surface
  immediately, including the ranked feed. No ranked result set may be served that was
  assembled before the viewer was known.
- **FR-007**: Every feed response MUST include some posts from outside the viewer's
  established signals, so a feed cannot collapse to a single interest and stay there.
- **FR-008**: The feed MUST page continuously, without a visible interruption at a page
  boundary, and MUST NOT repeat a post already shown in the same session.
- **FR-009**: If a ranking cannot be produced, the system MUST serve a defensible fallback
  ordering rather than failing the request.
- **FR-010**: The user interface MUST NOT display any explanation of why a post was ranked
  where it was.

**Control and disclosure**

- **FR-011**: A person MUST be able to read, in plain language and from Settings, what
  their feed is ranked from.
- **FR-012**: A person MUST be able to clear their ranking signals, after which the feed is
  ranked as it would be for a new account holding the same seed interests.
- **FR-013**: One person's signals MUST NOT be readable by another person through any
  surface, and MUST NOT be inferable from a public count, ordering, or aggregate.
- **FR-014**: On first run the system MUST offer a one-time interest selection, described
  as a starting point. Those picks seed the ranking; they MUST NOT create follows and MUST
  NOT be presented as a subscription.
- **FR-015**: A person who skips or abandons first-run selection MUST still receive a
  populated feed.

**Interests remain load-bearing** *(Constitution 2.0.0, Principle I)*

- **FR-016**: Publishing a post without at least one interest MUST fail, and the failure
  MUST name the missing interest.
- **FR-017**: Every post MUST display its interest, and that display MUST navigate to the
  interest's space.
- **FR-018**: An interest space MUST list that interest's posts, including those rolled up
  from its sub-interests, and MUST state that the roll-up is happening.
- **FR-019**: Search MUST return interests, places and people as distinguishable kinds.
- **FR-020**: A place MUST NOT carry the interest visual treatment, because following a
  place does not place its posts in a feed.

**The redesign**

- **FR-021**: The feed MUST present posts in a two-column waterfall in which column height
  is driven by media height, so the columns stagger.
- **FR-022**: All twenty screens MUST use a single typeface and a single accent colour.
- **FR-023**: No screen may cast a shadow. Depth MUST come from surface, spacing and radius.
- **FR-024**: An interest MUST be rendered as a coloured word, not a chip, badge or stamp,
  and its colour MUST be derived from the interest rather than assigned by hand.
- **FR-025**: Every interactive control MUST present at least 44x44 points.
- **FR-026**: All text MUST scale with the platform font-size setting. A screen whose
  content can exceed the display MUST be scrollable, so no control becomes unreachable.
- **FR-027**: Every existing test identifier MUST be preserved with the same meaning.
  Renaming, removing, or moving one to a different element is not permitted.
- **FR-028**: Every safety and visibility behaviour MUST be unchanged by the redesign, with
  the sole exception of the feed composition this feature replaces.

### Removed Scope *(withdrawals, each requiring a task)*

- **RS-001**: **001/FR-033 is WITHDRAWN.** "A person-follow must not widen a feed beyond
  followed interests" describes a subscription feed that no longer exists.
- **RS-002**: The negative test enforcing it MUST be **deleted, not weakened**. A softened
  version would assert a boundary the product no longer has and would read as coverage.
- **RS-003**: The end-to-end feed journey and fixture built on that boundary MUST be
  deleted or rewritten against the ranked feed.
- **RS-004**: **001/SC-006 and 001/US4** MUST be marked withdrawn in the 001 specification,
  with a pointer to this feature.
- **RS-005**: `specs/001-interest-media-sharing/plan.md`'s Constitution Check was written
  against version 1.0.0 and MUST be re-evaluated against 2.0.0.
- **RS-006**: The project guide's description of the feed as *composed* from followed
  interests MUST be corrected.

### Key Entities

- **Signal**: One recorded observation of a viewer's behaviour toward one post — opened,
  dwelt on for a duration, liked, or saved. Belongs to exactly one viewer. Private.
- **Signal profile**: The accumulated weight, per viewer, across the dimensions the
  ranking uses. Derived from signals; cleared when signals are cleared.
- **Seed interests**: The interests chosen at first run. A starting point for ranking, not
  a follow list and not a subscription.
- **Candidate set**: The posts the ranking proposes for one feed request, before the
  visibility boundary has decided which of them the viewer may see.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a session in which a person engages with one interest and skips
  another, the next feed places the engaged interest's posts measurably earlier — verified
  by comparing positions before and after, not by inspection.
- **SC-002**: A new account that picks interests reaches a populated feed in under 60
  seconds from first launch, with no empty state along the way.
- **SC-003**: A person can find what their feed is built from, and clear it, in under 30
  seconds from the app's main screen, without guidance.
- **SC-004**: No feed response consists entirely of one interest, measured across 100
  consecutive responses for a person whose signals all point at one interest.
- **SC-005**: A post made private is absent from every surface, including the ranked feed,
  on the first request after the change — measured, with zero stale appearances.
- **SC-006**: A blocked person's posts appear zero times in the blocker's ranked feed
  across 100 responses.
- **SC-007**: One person's signals are not observable by another person on any of the
  surfaces enumerated in the visibility contract — checked mechanically over all of them.
- **SC-008**: Four or more posts are visible on the feed without scrolling, on the shortest
  supported screen.
- **SC-009**: Every interactive control across all twenty screens meets 44x44, checked
  mechanically rather than by eye.
- **SC-010**: At the largest platform font setting on the shortest supported screen, every
  control on every screen remains reachable — including the block control on the safety
  sheet, which was unreachable in production once before.
- **SC-011**: Every existing test identifier still resolves, and the full journey suite
  passes with no change to its assertions about behaviour.
- **SC-012**: The feed's first screen is ready in under 2 seconds on the reference device
  at the 95th percentile.

## Assumptions

- **Signals are collected on the device and sent to the server.** Ranking happens
  server-side; the client reports what happened and displays what it is given.
- **"Behaviour" means the four signals in FR-003** — open, dwell, like, save. Follows,
  comments and reports are deliberately excluded from the first version: a report is not a
  preference, and treating it as one would rank harmful content higher.
- **Ranking quality is not specified numerically.** SC-001 asserts the feed moves in the
  direction of the signals, not that it is good. Measuring quality needs real usage, which
  the project does not have.
- **The reference device is the emulator profile CI already runs**, and the shortest
  supported screen is 640 points tall — the height at which a safety control was found
  unreachable in emulator run 35.
- **Existing media, visibility, blocking, moderation, chat, places and reviews behaviour is
  unchanged.** This feature replaces feed composition and the presentation layer, nothing
  else.
- **The design is settled.** `design/007-ui/` holds twenty approved artboards; this
  specification does not re-open visual decisions.
- **Cold start is one screen, once.** It does not become an onboarding sequence.
- **No cloud spend.** Everything remains runnable on the local profile, per the
  constitution's cost constraints. A ranking service is a component of the existing
  application, not a managed service.
