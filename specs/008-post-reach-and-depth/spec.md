# Feature Specification: Post reach and depth

**Feature Branch**: `claude/spec-kit-integration-juhrza`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "from the current functionality, i want you add functionaly to my frontend and backend, for example in frontend, you can learn from interntet of big app what functonalit they have, and what can add to my app, and the backend, how does the post share to user,"

## What this feature is, and what it is not

The request has two halves: **add the functionality a big app has**, and **settle how a post
reaches a person**. Before proposing anything, the current build was read. That changed the
answer to both halves, and the changes are the reason this spec is shaped as it is.

**Sharing is largely built already.** `POST /v1/posts/:postId/share-link` exists,
`ShareResolutionService` resolves a link against the viewer's own visibility rather than
granting access with it (001/FR-042), the share screen offers the viewer's accepted
conversations, and `SharedPostBubble` renders a post inside a message. **Nothing here
re-specifies that.** What is missing is narrower and is US2: a post can only be sent to
somebody the viewer ALREADY has an accepted conversation with, and the link can only leave
the app by being read off the screen.

**And the survey found something worse than a missing feature.** The publish screen tells
people "**Up to 10 photos**", the API accepts them, they upload, they are stored — and
every surface that renders a post reads `media[0]` and nothing else. A person can publish
ten photographs and **nine of them are invisible to everyone, including the person who
posted them, permanently**. That is not a gap in the feature set; it is the product
accepting content it never shows. It is US1 and it is P1.

So this feature is deliberately NOT a survey of what large apps have. The patterns it
borrows — a media carousel, a following feed, comment replies, saved collections — are
standard across Instagram, Xiaohongshu and similar products, and are named here because
**this build already promises or implies each one and does not deliver it**. A feature
this app has no evidence of needing is a feature this spec does not add.

**Explicitly out of scope**: push notifications (they need a hosted push service and a
deployment target, and 003's hosting decision is still the owner's and still pending);
stories or any ephemeral surface (nothing in the product implies one); direct video
playback controls (001/SC-011 is already open and unchanged).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the whole post (Priority: P1)

Someone publishes a set of photographs — a climb from four angles, a finished pot from
three. Today the first one is shown on every surface and the rest exist only as rows in a
database. This story makes every photograph in a post reachable: the post detail shows
them in order, one at a time, and says how many there are.

**Why this priority**: The product already promises this in its own words ("Up to 10
photos") and already charges the person the upload. Publishing content the product then
hides is worse than not accepting it, and it is invisible to every existing test because
they all assert that *a* post rendered.

**Independent Test**: Publish a post with three ready images, open it, and reach the second
and third. Delivers the content people have already been uploading.

**Acceptance Scenarios**:

1. **Given** a post with three ready images, **When** a viewer opens its detail, **Then**
   all three are reachable in the order they were published, and the position within the
   set is shown.
2. **Given** a post with one image, **When** a viewer opens it, **Then** no position
   indicator or navigation appears — a single photograph must not gain chrome.
3. **Given** a post whose second image failed processing, **When** a viewer opens it,
   **Then** the ready images are still reachable and the failed one is accounted for rather
   than silently skipped.
4. **Given** a post with several images, **When** it appears in the feed, **Then** the card
   indicates there is more than one without the feed becoming a set of carousels.

---

### User Story 2 - Send a post to a person (Priority: P1)

A viewer sees something a specific person would care about. Today they can send it only
into a conversation that already exists and has been accepted, or read a URL off the
screen and retype it elsewhere. This story lets them choose a person, and lets the link
leave the app the way every other app's does.

**Why this priority**: It is the half of the request that named the backend, and it is the
narrowest remaining gap in a mechanism that is otherwise built. A share that only works
with people you are already talking to cannot introduce anybody to anything.

**Independent Test**: From a post, send it to a person the viewer has never messaged, and
confirm the recipient receives it under the same rules a first message follows.

**Acceptance Scenarios**:

1. **Given** a viewer looking at a post, **When** they choose a person they have no
   conversation with, **Then** the post is delivered as the opening message of a
   conversation REQUEST, following the same acceptance rules as any other first contact.
2. **Given** a post the recipient is not allowed to see, **When** it is sent to them,
   **Then** they receive no content and learn nothing about the post's existence.
3. **Given** a viewer and a person who has blocked them, **When** they try to send,
   **Then** it is refused without disclosing that a block is the reason.
4. **Given** a viewer with a post open, **When** they use the device's own share
   mechanism, **Then** the link is handed to it, so it can reach anything outside the app.
5. **Given** a post whose visibility is later narrowed, **When** a previously sent link is
   opened, **Then** it resolves against the viewer's CURRENT permission and shows nothing
   if that permission is gone.

---

### User Story 3 - A feed of the people you chose (Priority: P2)

The feed already shows two tabs, "For you" and "Following". Only the first does anything.
This story makes the second real: posts from the people the viewer follows, newest first,
with no ranking and no exploration.

**Why this priority**: It is a control the product already renders, so a person can already
tap it and get nothing. A visible dead control is a defect the moment somebody uses it —
and this one is on the primary surface. It is P2 rather than P1 only because it misleads
rather than loses anything.

**Independent Test**: Follow one person, have them publish, and see that post in Following
and not see posts from people the viewer does not follow.

**Acceptance Scenarios**:

1. **Given** a viewer following two people, **When** they open Following, **Then** they see
   those people's posts in reverse chronological order and nobody else's.
2. **Given** a viewer following nobody, **When** they open Following, **Then** they are told
   what the tab is for and how to fill it, not shown an error.
3. **Given** a post the viewer may not see, **When** its author is followed, **Then** it does
   not appear — following a person does not widen what they may see.
4. **Given** the Following tab, **When** it is read, **Then** no ranking signal is recorded
   from it: a chronological list is not evidence of preference.

---

### User Story 4 - Reply to a comment (Priority: P2)

Comments are a flat list. Two people discussing one point are indistinguishable from six
people making six remarks. This story lets a comment be a reply to another, and shows the
conversation as a conversation.

**Why this priority**: It is the difference between a comment section and a list of
opinions, and it is the single most common structure in every comparable product. Lower
than the two above because nothing is currently lost or falsely advertised.

**Independent Test**: Reply to a comment and see the reply attached to it rather than at
the end of the list.

**Acceptance Scenarios**:

1. **Given** a post with a comment, **When** a viewer replies to it, **Then** the reply is
   shown with that comment rather than as a new top-level entry.
2. **Given** a comment with replies, **When** the parent is removed by moderation, **Then**
   the replies remain readable and the removal is stated where the parent was.
3. **Given** a reply, **When** the viewer may not see the post, **Then** they may not see
   the reply either — the boundary is the post's, not the comment's.
4. **Given** a deeply nested exchange, **When** it is displayed, **Then** nesting is bounded
   so a thread cannot indent itself off the screen.

---

### User Story 5 - Keep saved posts in collections (Priority: P3)

Saved posts are one undifferentiated list. This story lets a person group them — recipes,
routes, glazes — and name the groups.

**Why this priority**: It is the natural end of a saved list once it is longer than a
screen, and saving is already the strongest ranking signal the product collects. Last
because the existing list works and nothing about it is wrong, only thin.

**Independent Test**: Save two posts into different named collections and open one
collection without seeing the other's contents.

**Acceptance Scenarios**:

1. **Given** a saved post, **When** the viewer puts it in a named collection, **Then** it
   appears in that collection and remains in the full saved list.
2. **Given** a collection, **When** anybody other than its owner asks for it, **Then** it is
   not available — a collection is as private as the saved list it draws from.
3. **Given** a post in a collection, **When** the post becomes invisible to the viewer,
   **Then** it is absent from the collection for the same reason it is absent everywhere.

---

### Edge Cases

- A post's images finish processing at different times: the set must be navigable as soon
  as any image is ready, rather than waiting for the slowest.
- A share is sent to somebody who blocks the sender a moment later: the already-delivered
  message follows the existing block rules; no new disclosure path is created.
- A person follows several hundred accounts: the Following feed must page like every other
  list rather than loading everything.
- A reply is written to a comment that is deleted before it is submitted: the reply must
  fail in a way that explains itself, not attach to nothing.
- A collection is emptied: it remains, because a named empty collection is a decision the
  person made, not an error state.
- A post carrying ten images is opened on the shortest supported screen: navigation between
  images must remain reachable at the largest platform font.

## Requirements *(mandatory)*

### Functional Requirements

**Seeing the whole post**

- **FR-001**: A post's ready media MUST all be reachable from its detail surface, in the
  order they were published.
- **FR-002**: The detail surface MUST show the viewer's position within a set of more than
  one, and MUST show no such indicator for a single item.
- **FR-003**: A browse surface MUST indicate that a post carries more than one item without
  making the browse surface itself navigable per item.
- **FR-004**: Media that failed processing MUST be accounted for on the detail surface
  rather than omitted silently, and MUST remain visible only to the post's author, as today.

**Sending a post**

- **FR-005**: A viewer MUST be able to send a post to a person with whom they have no
  existing conversation.
- **FR-006**: Such a send MUST create a conversation REQUEST and MUST obey the existing
  request rules exactly; it MUST NOT become a route around them.
- **FR-007**: A sent post MUST be resolved against the RECIPIENT's own visibility at read
  time, so a recipient who may not see the post receives nothing and learns nothing.
- **FR-008**: A send that a block forbids MUST be refused without revealing that a block is
  the reason.
- **FR-009**: The share surface MUST hand the post's link to the device's own share
  mechanism.
- **FR-010**: A share link MUST continue to confer no access of its own (001/FR-042).

**The Following feed**

- **FR-011**: The Following surface MUST return posts authored by people the viewer follows,
  most recent first, with no ranking and no exploration.
- **FR-012**: The Following surface MUST pass every candidate through the same visibility
  boundary as every other surface, at read time.
- **FR-013**: Reading the Following surface MUST NOT record behavioural ranking signals.
- **FR-014**: A viewer following nobody MUST be shown what the surface is for and how to
  fill it.

**Replies**

- **FR-015**: A comment MUST be able to name another comment on the same post as its parent.
- **FR-016**: Replies MUST be displayed with their parent rather than in publication order.
- **FR-017**: Nesting MUST be bounded, and a reply to a reply beyond that bound MUST attach
  to the deepest permitted ancestor rather than being refused.
- **FR-018**: A moderated parent MUST leave its replies readable, with the removal stated in
  the parent's place.

**Collections**

- **FR-019**: A person MUST be able to create named collections and place saved posts in
  them; a post MAY be in more than one.
- **FR-020**: A collection MUST be readable only by its owner, on every surface.
- **FR-021**: A post placed in a collection MUST remain in the undifferentiated saved list.

**Throughout**

- **FR-022**: Every new read path MUST go through the single visibility boundary, per
  Constitution II, and MUST appear in the visibility matrix contract.
- **FR-023**: Every new surface MUST carry stable test identifiers, per 006/FR-027.

### Key Entities

- **Media set**: the ordered media already attached to a post. No new storage — this
  feature reads what publishing has always written.
- **Post send**: a message whose content is a reference to a post, delivered into a
  conversation that may not have existed before. Extends the existing shared-post message.
- **Follow feed page**: a chronological page over the authors a viewer follows. Derived at
  read time; nothing is materialised.
- **Comment parent**: an optional reference from a comment to another comment on the same
  post.
- **Collection**: a named, private grouping of a person's own saved posts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A post published with ten photographs shows all ten to a viewer who may see
  it, measured by counting what is reachable from the detail surface against what was
  published.
- **SC-002**: Zero published media items are unreachable on any surface, measured across a
  fixture containing single-image, multi-image, video and partially-failed posts.
- **SC-003**: A viewer can send a post to a person they have never messaged and the
  recipient can open it, in under 30 seconds from the post being on screen.
- **SC-004**: A post sent to somebody who may not see it yields no content and no evidence
  of the post's existence, verified through the path a modified client would take rather
  than the app's own.
- **SC-005**: The Following surface returns only posts by followed authors, verified across
  a fixture where followed and unfollowed authors have both published, with zero
  unfollowed-author posts present.
- **SC-006**: Reading the Following surface moves no ranking weight, measured by comparing
  the viewer's signal profile before and after.
- **SC-007**: A reply is displayed with its parent in 100% of cases in a fixture containing
  replies, replies-to-replies, and a moderated parent.
- **SC-008**: Every collection is unreadable by anyone but its owner, verified on every
  enumerated surface.
- **SC-009**: Every new read path appears in the visibility matrix with zero skipped rows.
- **SC-010**: Navigation between images in a ten-image post is reachable at the largest
  platform font on the shortest supported screen.

## Assumptions

- **Sharing is not rebuilt.** The share link, its resolution against viewer permission, and
  posting into an existing conversation all work and are left alone. US2 adds a recipient
  who is not yet a correspondent, and an exit to the system share sheet.
- **A post sent to a stranger is a message request**, not a new kind of object. Reusing the
  request rules is what keeps this from becoming a way to push content at people who have
  not agreed to hear from the sender.
- **The Following feed is chronological and unranked.** Ranking it would make it a second
  "For you", which is the thing it exists to be an alternative to.
- **Reply nesting is bounded at one level** (a reply to a reply attaches to the same
  parent). Deeper trees are a display problem long before they are a data problem, and no
  evidence in this product calls for them.
- **Collections are private.** Public boards are a different feature with a different
  privacy surface, and nothing in the product implies one yet.
- **No push notifications.** They need a hosted push service and a deployment target;
  003's hosting decision is the owner's and is recorded as pending.
- **Existing test identifiers are preserved.** 006/FR-027 and its snapshot still bind.

## Dependencies

- The visibility boundary (`VisibilityFilter`) and the matrix contract, unchanged.
- The conversation request rules from 004/005, reused rather than reimplemented.
- The ranked feed and its signal collection from 007, which the Following surface must
  deliberately NOT feed.
- No new external service, no new datastore, nothing provisioned. Everything in this
  feature runs on the local profile.
