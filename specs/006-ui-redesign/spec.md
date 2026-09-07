# Feature Specification: an interest-first visual system, and showing the media

**Feature branch**: `claude/spec-kit-integration-juhrza`
**Created**: 2026-09-07
**Status**: Draft
**Input**: "i want u redesign the ui as current ui is too general"

## Why this exists

"Too general" is a fair description and it has an exact, checkable cause. It is
not only a matter of taste.

**Measured on 2026-09-07, from the code and from 20 screenshots of the running
app** (`docs/screens/`), not assumed:

| Observation | Evidence |
|---|---|
| A post in a list is **one line of text** | `PostRow` in `apps/mobile/src/screens/index.tsx` is a `Pressable` wrapping one `Text` with the caption. Nothing else. It is used by the feed, interest spaces, profiles, saved and place pages |
| The app renders **no images anywhere except two screens** | `Image` is imported in exactly 2 of ~40 component files: `PostDetailScreen` and `MediaPickerScreen` |
| There are **no avatars** | No component renders a person's image; authors appear as handles or not at all |
| The design system is **8 colours and 5 primitives** | `apps/mobile/src/ui/theme.ts`; `Button`, `Banner`, `EmptyState`, `Row`, `Screen` |
| Nothing distinguishes one interest from another | Every interest space renders identically; the interest is a title string |
| Every screen is a **white column of default-styled buttons** | Visible in all 20 screenshots |

The product is an interest-centred **media** sharing app whose media is invisible
on every browse surface, and whose organising principle — the interest — has no
visual presence at all. A person scrolling the feed sees a list of sentences.

That is the gap this feature closes.

## Clarifications

### Session 2026-09-07

- Q: What should the redesign feel like? → **A: Interest-first identity.** Each
  interest carries a colour and is the visual anchor; the product's premise is
  made visible rather than imitating a person-centred feed.
- Q: What colour? → **A: A dark green theme.** Implemented as one brand hue
  (`152`) that every green derives from, with dark as the default palette.
- Q: How far should it go? → **A: Visual system + show the media.** New theme,
  typography, cards and avatars, and actually render images on browse surfaces.
  **No navigation restructure**, so every screen and every testID stays where it
  is.

## User Scenarios & Testing

### User Story 1 — A person sees what was posted (Priority: P1) 🎯 MVP

Someone opens the feed and sees the photographs and videos people shared, with
who posted them and which interest they belong to — not a list of captions.

**Why this priority**: it is the largest gap between what the product is and what
it shows, and it is the first screen anyone sees. Every other improvement is
smaller than this one.

**Independent Test**: open the feed with posts that have ready media; the media
renders, with author and interest, and tapping still opens the post.

**Acceptance Scenarios**:

1. **Given** a feed of posts with ready images, **When** a person opens the feed,
   **Then** each post shows its image, its author, its interest and its counts.
2. **Given** a post whose media is still processing, **When** it appears in a
   list, **Then** a placeholder holds the same space and does not collapse the
   row or shift what is below it.
3. **Given** a post with no media (text only), **When** it appears in a list,
   **Then** it renders as a readable text card rather than an empty frame.
4. **Given** a video post, **When** it appears in a list, **Then** its poster
   frame renders with a visible indication that it is a video.

### User Story 2 — An interest looks like a place (Priority: P2)

Someone browsing interests can tell them apart at a glance, and a post carries a
visible mark of the interest it belongs to.

**Why this priority**: this is the product's premise. It is second only because a
person must be able to see the content before the organising principle around it
means anything.

**Independent Test**: open two different interest spaces; they are visually
distinguishable without reading the title.

**Acceptance Scenarios**:

1. **Given** any interest, **When** it is shown anywhere, **Then** it carries the
   same colour every time, derived from the interest itself so it is stable
   without storage.
2. **Given** a sub-interest, **When** it is shown, **Then** its colour relates to
   its parent's, so the hierarchy is visible (FR-024's roll-up made legible).
3. **Given** a person viewing an interest space, **When** the screen loads,
   **Then** the interest's identity is present in the screen's own chrome.

### User Story 3 — The product reads as one product (Priority: P3)

Every screen shares a type scale, spacing rhythm, and component vocabulary, and
works in both light and dark.

**Independent Test**: the 20 captured screens, recaptured after the change, are
visibly one system.

**Acceptance Scenarios**:

1. **Given** any screen, **When** it renders, **Then** it uses the shared type
   scale and spacing rather than ad-hoc values.
2. **Given** a person with dark mode on, **When** they use the app, **Then**
   every screen is legible and no colour pair falls below contrast requirements.
3. **Given** any interactive control, **When** it is rendered, **Then** it meets
   the minimum touch target size.

## Requirements

### Functional Requirements

**Showing the content**

- **FR-001**: A post in any list MUST render its media when the media is ready.
- **FR-002**: A post row MUST show its author, including an avatar.
- **FR-003**: A post row MUST show the interest(s) it belongs to.
- **FR-004**: A post row MUST show its reaction and comment counts.
- **FR-005**: A post whose media is not ready MUST reserve the same space as one
  that is, so a list does not shift as media becomes ready.
- **FR-006**: A video in a list MUST show its poster frame and be identifiable as
  a video without playing it.
- **FR-007**: A post with no media MUST render as a deliberate text card, not as
  an empty media frame.
- **FR-008**: Media MUST NOT be requested at full size for a list; the smallest
  rendition that fits MUST be used.
- **FR-009**: A person MUST have an avatar everywhere they are named — post rows,
  comments, reviews, conversation lists, participant lists and profiles.
- **FR-010**: An avatar for a person with no image MUST be generated from their
  identity and MUST be stable across screens and sessions.

**Interest identity**

- **FR-011**: Every interest MUST have a colour that is derived from the interest
  and is identical on every surface and every device.
- **FR-012**: A sub-interest's colour MUST be visibly related to its parent's.
- **FR-013**: An interest's colour MUST be used on the interest space, on the
  interest chips carried by posts, and in discovery results.
- **FR-014**: An interest colour MUST NOT be the only means of distinguishing an
  interest; the name MUST always be present too.
- **FR-015**: Every interest colour MUST meet contrast requirements against the
  text placed on it, in both light and dark.

**The system**

- **FR-016**: A single theme MUST define colour, type, spacing, radius and
  elevation, and screens MUST NOT hard-code values it defines.
- **FR-017**: The theme MUST provide a light and a dark palette.
- **FR-018**: The type scale MUST distinguish at least display, title, body,
  label and caption roles.
- **FR-019**: A shared card component MUST exist and be used by every surface
  that lists content.
- **FR-020**: Every interactive control MUST have a touch target of at least
  44×44 points.
- **FR-021**: Text MUST respect the platform's font scaling setting.
- **FR-022**: Every screen MUST render correctly with the device's smallest
  supported width without horizontal scrolling.
- **FR-023**: Loading states MUST be represented by skeletons matching the shape
  of the content that will replace them, not a spinner on an empty screen.
- **FR-024**: Empty states MUST keep the distinct copy they already have; the
  redesign MUST NOT collapse them into one generic message.

**What must not change**

- **FR-025**: Every existing `testID` MUST be preserved, with the same meaning.
  Adding new ones is permitted; renaming, removing, or moving one to a different
  element is not.
- **FR-026**: No screen may be added, removed, or moved between the tab root and
  the pushed stack.
- **FR-027**: No API request, response shape, or data-layer method may change.
- **FR-028**: Every visibility, blocking and safety behaviour MUST be unchanged;
  no read path may be added or bypassed.
- **FR-029**: The app MUST continue to render under `react-native-web`, because
  the browser journeys are a verification surface.

### Key Entities

- **Design token**: a named value (colour, size, weight, radius, elevation) in
  one theme, referenced by name.
- **Interest colour**: a hue derived from an interest's stable identifier, with a
  contrast-checked pairing for text.
- **Card**: the shared container for a listed item — post, review, conversation,
  place.
- **Avatar**: a person's image, or a stable generated stand-in.

## Success Criteria

- **SC-001**: A post in a list shows media, author, interest and counts on every
  surface that lists posts — feed, interest space, profile, saved, place page —
  with zero surfaces left rendering a bare caption.
- **SC-002**: `Image` (or the app's media component) is reachable from every
  browse surface, verified by rendering, not by inspection.
- **SC-003**: Two different interests are distinguishable in a screenshot with
  the titles removed.
- **SC-004**: Every colour pair the theme can produce meets WCAG AA contrast
  (4.5:1 for body text, 3:1 for large text), checked mechanically for both
  palettes and for every interest colour — not sampled.
- **SC-005**: All 178 existing testIDs still resolve, `verify-maestro-ids`
  passes, and all 19 Maestro flows and all browser journeys pass unchanged.
- **SC-006**: A list does not shift position as media loads, measured by
  comparing the position of a known row before and after media becomes ready.
- **SC-007**: Every interactive control meets the 44×44 minimum, checked
  mechanically rather than by eye.
- **SC-008**: The 20 captured screens are recaptured after the change and the
  before/after pair is reviewable in one place.
- **SC-009**: The API test suite, mobile tests and e2e journeys pass with no
  change to their assertions about behaviour.

## Assumptions

- **The media renditions needed for lists already exist.** 001 produces
  transcoded renditions and a poster frame; this feature consumes them and adds
  no pipeline work. If a small rendition is missing, that is a finding to report,
  not a licence to fetch originals into a list.
- **Avatars have no upload path today.** FR-009 is met by generated avatars;
  adding avatar upload is a separate feature and is out of scope.
- **Interest colour is derived, never stored.** Storing it would need a migration
  and an editing surface, and would let two clients disagree.
- **No new dependency is assumed.** If one is proposed it must be justified
  against the sandbox's constraints (see `CLAUDE.md` dead ends) and the fact that
  Expo native modules must be installed with `expo install`.

## Out of Scope

- Navigation or information-architecture changes (explicitly declined).
- Avatar upload, custom interest colours, themes chosen by the person.
- Animation and transition work beyond what a card and skeleton need.
- iOS-specific design work — nothing has ever run on iOS.
- Any change to what is visible to whom.
