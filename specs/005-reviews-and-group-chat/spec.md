# Feature Specification: Place reviews and group conversations

**Feature Branch**: `claude/spec-kit-integration-juhrza`

**Created**: 2026-09-07

**Status**: Draft

**Input**: The owner selected two items that feature 004 deliberately ruled out of scope:
reviews and ratings on a place page, and group chat. Both were excluded by decision rather
than oversight, and this spec must say what changes as a result.

## What already exists — measured on 2026-09-07, not assumed

The last spec claimed a requirement was unimplemented because it grepped the identifier the
requirement was worded with rather than the one the code uses. This table was produced by
reading the source.

| Thing | State | Where |
|---|---|---|
| Places: create, dedupe per locality, follow, place page of posts | **Built** (004/US2) | `modules/places/` |
| Reporting with a typed subject | **Built**, six subject types: `post`, `comment`, `interest`, `message`, `place`, `interest-description` | `safety.controller.ts:10` |
| Moderation queue, decision, append-only log | **Built**; `remove_content` already branches per subject type | `moderation.controller.ts` |
| Blocking, with severance computed rather than stored | **Built** (004/FR-006) | `block.repository.ts` |
| One-to-one conversations, requests, accept, long-poll delivery | **Built** (004/US1) | `modules/conversations/` |
| Conversation id **derived from the sorted participant pair** | **Built**, and throws if given one person twice | `conversation-id.ts` |
| Visibility boundary with an enumerated surface list | **Built**, 11 surfaces, 462 assertions | `tests/visibility/surfaces.ts` |
| Ratings or reviews of anything | **Does not exist** | — |
| Conversations with more than two people | **Does not exist, and cannot without replacing the id derivation** | — |

Two consequences follow, and they set this feature's shape:

1. **Review safety is an extension, not an invention.** Reporting already takes a subject
   type; moderation already removes content per type. A review becomes a seventh subject
   type and one more branch. This is much smaller than it would have been, and saying so
   is more useful than inflating it.
2. **Group conversations replace a load-bearing invariant.** `conversationIdFor(a, b)`
   sorts two ids and hashes them, which is what makes "open a conversation" idempotent
   with no uniqueness item and no race. A group has no such natural key. This is the
   feature's real cost and it is not reducible to an extra column.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rate a place (Priority: P1)

Someone who has eaten at a restaurant, climbed at a gym or drunk at a bar opens its place
page and leaves a rating, optionally with a few sentences about why. The place page shows
its average rating and how many people gave one, so the next person arriving from a post
can tell at a glance whether it is worth their evening.

**Why this priority**: It is the smallest slice that delivers the value the owner asked
for. A rating with no review text is still useful; review text with no rating is not
summarisable. Ratings alone would ship as a coherent product.

**Independent Test**: Rate a place from its page as one person, then open the same page as
a second person and read back the average and the count. Fully testable without any part
of US2 or US3 existing.

**Acceptance Scenarios**:

1. **Given** a place page and a signed-in person who has not rated it, **When** they submit
   a rating of 1 to 5, **Then** the place's average rating and rating count update for
   every viewer immediately.
2. **Given** a person who has already rated a place, **When** they submit a different
   rating, **Then** their earlier rating is replaced rather than added, and the count does
   not increase.
3. **Given** a signed-out visitor, **When** they open a place page, **Then** they can read
   the average and the count but are refused when they attempt to rate.
4. **Given** a person who rated a place, **When** they delete their rating, **Then** the
   average and count recompute without it.

---

### User Story 2 - Read and write reviews on a place (Priority: P2)

Below the rating, a person can read what others wrote about a place and add their own
paragraph. Reviews are ordinary user content: they can be reported, they are subject to
blocking, and a moderator can remove one.

**Why this priority**: Text is what makes a rating trustworthy, but it is also what
introduces a moderation surface. It ships second because US1 is coherent without it, and
because it must ship *with* its safety controls rather than before them.

**Independent Test**: Write a review as one person, read it as another, report it as a
third, and remove it as a moderator — then confirm it is gone from the place page and that
the moderation record survives its removal.

**Acceptance Scenarios**:

1. **Given** a place page, **When** a person submits review text with their rating,
   **Then** it appears on the place page attributed to them.
2. **Given** a person who has blocked the author of a review, **When** they open that
   place page, **Then** the review is absent — in both block directions.
3. **Given** any signed-in person, **When** they report a review, **Then** it enters the
   same moderation queue as a reported post, comment or message.
4. **Given** a moderator removing a review, **When** the decision is made, **Then** the
   review no longer appears on the place page and the decision is recorded in the
   append-only log, which survives the review's removal.
5. **Given** a place page, **When** a viewer reads it, **Then** the reviews shown are only
   those the visibility boundary permits — the place page's existing rules, applied to a
   new kind of content on the same surface.

---

### User Story 3 - Talk to several people at once (Priority: P3)

A person starts a conversation with more than one other person — the three people who were
at the same climbing gym, say — gives it a name, and everyone in it can read and send
messages. Somebody can be added later. Anybody can leave.

**Why this priority**: It is the largest and riskiest of the three, and it is the one that
replaces working machinery rather than adding to it. Shipping it last means US1 and US2 are
already delivering value if this takes longer than expected — which it will.

**Independent Test**: Create a conversation with three people, send from each, confirm all
three see all messages, add a fourth, and have one leave. Testable end to end without US1
or US2.

**Acceptance Scenarios**:

1. **Given** a signed-in person, **When** they start a conversation naming two or more
   others, **Then** a group conversation is created and appears in every participant's
   inbox.
2. **Given** a group conversation, **When** any participant sends a message, **Then** every
   other participant receives it, and delivery is no slower than for a one-to-one
   conversation.
3. **Given** a person invited to a group by someone they do not follow, **When** they open
   their inbox, **Then** the group waits in Requests and generates no notification until
   they accept — the same rule as an unsolicited first message from one person.
4. **Given** a participant, **When** they leave a group, **Then** they stop receiving its
   messages, the remaining participants are told they left, and the messages they already
   sent stay readable.
5. **Given** a group conversation with a name, **When** anyone reports that name, **Then**
   it is treated as user-generated content and enters the moderation queue.
6. **Given** existing one-to-one conversations, **When** group conversations ship, **Then**
   every existing conversation remains readable and its identifier does not change.

---

### Edge Cases

- **A place with no ratings.** The page must distinguish "nobody has rated this" from a
  low score. An average of zero is a lie.
- **A single rating.** One 5-star rating is not an average worth displaying with
  confidence; the count is shown alongside so a reader can judge.
- **A review of a place that is later merged or removed.** Places can be created by anyone
  and deduped per locality. Reviews must not be orphaned by a place changing.
- **Rating a place you have never visited.** Nothing prevents it, by decision — see
  Assumptions.
- **A group of two.** Creating a "group" with exactly one other person must not produce a
  second, parallel conversation alongside the existing one-to-one thread with that person.
- **Everybody leaves a group.** The conversation must not become an unreachable orphan
  holding readable messages.
- **The last participant.** A group with one person left is a conversation with nobody to
  talk to; it must behave predictably rather than accidentally.
- **Adding somebody who is already in the group.** Must be a no-op, not a duplicate.
- **A person blocked by one participant but not others.** The add is refused (FR-023), and
  the refusal must not say why (FR-023a) — otherwise adding somebody to a group becomes a
  way to probe who has blocked whom.
- **A block created after the fact.** Two people already in a group, then one blocks the
  other: the group is untouched (FR-023b). This is the deliberate cost of the chosen rule —
  a block cannot retroactively separate people who already share a conversation.
- **Rejoining after a block.** Somebody who left a group and is later blocked by a
  remaining participant cannot be re-added, because FR-023 is evaluated at the moment of
  adding, not at creation.
- **A review author blocking a reader after writing.** Block severance is computed, not
  stored (004/FR-006), so this must resolve at read time like everything else.

## Requirements *(mandatory)*

### Functional Requirements

#### Ratings (US1)

- **FR-001**: The system MUST let a signed-in person give a place a rating of 1 to 5.
- **FR-002**: The system MUST hold at most one rating per person per place. Submitting
  again MUST replace the previous rating, never add to it.
- **FR-003**: A person MUST be able to withdraw their own rating.
- **FR-004**: A place MUST expose its average rating and the number of ratings behind it.
- **FR-005**: A place with no ratings MUST be distinguishable from a place rated poorly.
- **FR-006**: Rating a place MUST require being signed in; reading ratings MUST NOT.
- **FR-007**: A change to a rating MUST be reflected on every surface that shows that
  place's rating immediately, with no stale copy.

#### Reviews (US2)

- **FR-008**: A person MUST be able to attach review text to their rating of a place.
- **FR-009**: Review text MUST be optional; a rating without text is complete.
- **FR-010**: A review MUST be attributed to its author and readable from the place page.
- **FR-011**: A person MUST be able to edit or delete their own review text.
- **FR-012**: Reviews MUST pass through the single visibility boundary, and the place page
  MUST be enumerated in the visibility contract as a surface that returns reviews.
- **FR-013**: A review MUST NOT be shown to a person the author has blocked, nor to a
  person who has blocked the author.
- **FR-014**: Reviews MUST be reportable, using the existing typed-subject reporting path
  rather than a new one.
- **FR-015**: A moderator MUST be able to remove a review, and the decision MUST be written
  to the existing append-only log, which survives the review's deletion.
- **FR-016**: A removed review MUST NOT count toward the place's average rating.
- **FR-017**: Review text MUST be subject to the same content policy as media and other
  user-generated text.

#### Group conversations (US3)

- **FR-018**: A person MUST be able to create a conversation with more than two
  participants, up to a stated maximum.
- **FR-019**: Every participant MUST be able to read the conversation's messages and send
  to it.
- **FR-020**: A participant MUST be able to add another person to an existing group.
- **FR-021**: A participant MUST be able to leave a group at any time; messages they
  already sent MUST remain readable to the rest.
- **FR-022**: An invitation to a group from a person the invitee does not follow MUST wait
  in Requests and MUST NOT generate a notification until accepted — the same rule the
  one-to-one case applies to an unsolicited first message.
- **FR-023**: A person MUST NOT be added to a group that contains anyone they have blocked,
  or anyone who has blocked them. The attempt MUST be refused.
- **FR-023a**: The refusal MUST NOT disclose that a block exists, who it involves, or which
  direction it runs. A person adding a friend to a group learns only that the person cannot
  be added — never that some other participant blocked them, which would tell them
  something about two other people's relationship that neither chose to share.
- **FR-023b**: A block created *after* both people are already in a group MUST leave the
  group unchanged. Blocking someone MUST NOT remove the blocker from unrelated
  conversations they are part of.
- **FR-023c**: Blocking MUST remain absolute between two people in every one-to-one
  context, unchanged from 004/FR-006. This requirement narrows where two people can
  *become* group participants together; it does not weaken blocking anywhere it already
  applies.
- **FR-024**: A group MUST have a name that participants can set, and that name MUST be
  treated as user-generated content: reportable, moderatable, and subject to the same
  policy as any other text.
- **FR-025**: Membership MUST be stored explicitly and MUST NOT be derivable from the
  conversation's identifier.
- **FR-026**: Existing one-to-one conversations MUST continue to work unchanged, keeping
  their current identifiers and their current idempotent-open behaviour.
- **FR-027**: Creating a group with exactly one other person MUST NOT create a second
  conversation alongside the existing one-to-one thread with that person.
- **FR-028**: Message delivery to a group MUST use the same mechanism as one-to-one
  delivery, so that a person waiting on a group receives a message without polling for it.
- **FR-029**: A group with no remaining participants MUST NOT leave messages readable by
  anybody.
- **FR-030**: Membership changes MUST be visible to participants — a person joining or
  leaving is part of the conversation's history, not a silent mutation.
- **FR-031**: The maximum number of participants MUST be enforced server-side, where a
  modified client cannot exceed it.

### Key Entities

- **Rating**: one person's score of 1–5 for one place, replaceable and withdrawable. At
  most one per person per place.
- **Review**: optional text belonging to a rating, attributed to its author, reportable and
  removable by a moderator.
- **Place rating summary**: a place's average score and the number of ratings behind it,
  reflecting only ratings whose reviews have not been removed.
- **Group conversation**: a conversation with an explicit participant set rather than a
  derived pair, an optional name, and a per-participant state (invited, accepted, left).
- **Participation**: one person's membership of one conversation, carrying their state and
  the point at which they joined or left.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person can rate a place from its page and see the average update within one
  second.
- **SC-002**: A place's displayed average matches the ratings behind it exactly, verified
  by comparing the displayed value against the individual ratings for at least 100 places.
- **SC-003**: A person who has rated a place twice contributes exactly one rating to that
  place's average — asserted, not assumed.
- **SC-004**: A review written by a blocked person is absent from the place page in **both**
  block directions, verified through the path a modified client would take rather than only
  through the app.
- **SC-005**: The visibility contract enumerates every surface that returns a review, and
  each is proven to consult the shared boundary rather than to hold its own rule. Zero
  surfaces skipped.
- **SC-006**: A reported review reaches the same moderation queue as a reported post, and
  the record of its removal is still readable after the review is gone.
- **SC-007**: Three people in a group each receive every message sent by the other two,
  with delivery latency no worse than the one-to-one case at the same concurrency.
- **SC-008**: Every conversation that existed before this feature is still readable
  afterwards under its original identifier — verified against conversations created by the
  previous version, not by re-creating them.
- **SC-009**: A person invited to a group by a stranger receives no notification until they
  accept, held over a window rather than checked once.
- **SC-010**: The participant maximum cannot be exceeded by a request that bypasses the
  app.
- **SC-012**: Adding a blocked person to a group is refused, and the refusal is
  indistinguishable from the refusal given for any other reason a person cannot be added —
  compared as literal responses, since a message that differs only in wording still leaks
  the block.
- **SC-011**: A person who leaves a group receives no further messages from it, and the
  messages they sent before leaving remain readable to the others.

## Assumptions

Recorded because the feature description named two capabilities and not their details.
Each is a decision that can be revisited; none is a gap left unnoticed.

- **Anyone may rate any place.** Requiring a prior post at the place would be a
  verification mechanism nobody asked for, and would make the first rating of a new place
  impossible. The cost is that ratings are as trustworthy as the people giving them, which
  is what reporting and moderation exist for.
- **Ratings are 1–5 integers.** The most widely understood scale; a half-star or a
  ten-point scale changes nothing structural and can be revisited.
- **A rating is required; review text is optional.** The reverse cannot be summarised into
  an average, which is the thing the place page needs.
- **Reviews carry no photos.** A photograph of a place is already a post attached to that
  place, and duplicating that would give two answers to "show me pictures of this place".
- **Group maximum is 20 participants.** Large enough for the gatherings this product is
  about, small enough that fan-out stays a non-question. Enforced server-side (FR-031).
- **Any participant may add; nobody may remove another.** Removal is an ownership and
  authority question that the feature description did not raise, and leaving (FR-021)
  covers the case a person actually needs to solve for themselves.
- **A group's name is optional.** With no name, participants' names identify it.
- **This feature adds no new hosted infrastructure.** It runs entirely on the local
  profile, like everything before it. The datastore decision remains open and deferred by
  the owner, and nothing here depends on resolving it.

## Dependencies

- 004's conversation machinery, which US3 modifies rather than reuses.
- 004's places, which US1 and US2 attach to.
- 001's reporting, moderation queue, append-only log and blocking, all of which US2 extends
  by one subject type rather than duplicating.
- The single visibility boundary, which gains reviews as a new kind of content on an
  existing surface.

## Out of scope

- Replies to reviews, or voting reviews helpful. Both are engagement mechanics on top of a
  thing that does not exist yet.
- Ratings for interests or people. The owner asked for places.
- Group calls, typing indicators, read receipts per participant, or reactions to messages.
- Removing a participant from a group (see Assumptions).
- Merging the ratings of two places that are later found to be the same place. Places are
  deduped per locality at creation (004/FR-014); a post-hoc merge is a separate problem.
