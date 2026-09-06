# Feature Specification: Conversations, places, and the depth the product is missing

**Feature**: `004-chat-places-and-depth`
**Created**: 2026-09-06
**Status**: Draft — planning artifacts generated, not yet tasked
**Input**: "look at my current functionality, and give me a plan on what to add to the
functionality, currently the functionality is not complete, i want something like a chat
page, and has interest page / restaurant page and more"

## Why This Feature Exists

The product does one thing, end to end, and does it on a real Android runtime: file media
under an interest, and see it in an interest-composed feed. Ten journeys pass. What it
does **not** do is give a person a second reason to open it. There is no way to talk to
anyone. A post cannot be *about* somewhere. An interest page is a list of posts with a
follow button on top.

This spec turns the owner's request into five stories, and says plainly which parts are
new product surface and which are holes in scope that was already declared complete.

## What already exists — measured on 2026-09-06, not assumed

Verified against `apps/api/src/modules/`, `apps/mobile/src/features/`, and the passing
Android journey record `docs/verification/runs/2026-09-06-journey-run-android-PASS.md`.

| Area | State |
|---|---|
| Sign in, profile view/edit, account deletion | Present (`me.controller.ts`, `EditProfileScreen`) |
| Compose: device library → upload → caption → interest → visibility → publish | Present, driven on Android |
| Interest type-ahead search, interest space, sub-interest creation with similar-name dedupe | Present |
| Interest follow/unfollow at both levels, suggested interests | Present |
| Home feed: read-time assembly from followed interests, followed-author prominence, paging | Present |
| Post detail, edit, delete, react, comment, share link | Present |
| Person profile, person posts, person follow/unfollow | Present |
| Report post/comment/interest, block, moderation queue, interest admin | Present |
| Notification list | Present |
| **Notification preferences (001/FR-049)** | **ABSENT.** No endpoint, no field, no screen. Declared complete; is not. |
| **Video publish and playback (001/FR-005, FR-009)** | Code path exists; never once exercised — no video fixture. Unverified. |
| **Searching for a person** | Absent. Only interests are searchable. |
| Direct messages | Absent |
| Places / venues of any kind | Absent |
| Saved posts / collections | Absent |

Two other facts bear on scheduling and are stated here rather than discovered later:
the datastore decision (`specs/003-device-and-hosting/datastore-decision.md`) is
**pending**, and there is **no hosting** — DynamoDB Local is a dev tool.

## The two hazards this feature is built around

**1. Chat is a person-to-person surface inside a product whose first principle
(NON-NEGOTIABLE) is that content is organised by interest, never by a social graph.**
The failure mode is not that chat is forbidden — it is that chat quietly becomes the
reason people open the app, the interest structure goes vestigial, and nobody notices
because every test still passes. This spec therefore forbids the specific mechanism by
which that happens: a conversation MUST NOT contribute to, reorder, or widen any feed,
and a person's message activity MUST NOT influence what they are shown.

**2. A place is a second organising axis, and a place-follow is the exact shape of the
thing FR-033 was written to prevent.** A place page is also a new post read path, and
Principle II says every post read path goes through one visibility boundary and every
surface is enumerated in the matrix contract. Both consequences are requirements below,
not implementation details.

A third, quieter one: 001/FR-010 requires the server to strip embedded location from
uploaded media. Attaching a place to a post discloses location on purpose. The two must
not be allowed to meet — see FR-021.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Two people can talk (Priority: P1)

A person opens a post, taps through to the author's profile, and sends them a message.
The author sees it, replies, and the two have a conversation that persists across app
restarts. Neither of them can be made to receive messages they do not want: an
unsolicited first message lands in a Requests inbox and delivers no notification until
it is accepted, and blocking severs the conversation in both directions.

**Why this priority**: it is the owner's first named ask, and it is the only story here
that changes what the product *is*. It is P1 with a safety gate, not P1 alone
(Constitution IV).

**Independent test**: two seeded identities, a message sent over HTTP from one and read
by the other; a third identity's first message lands in Requests; a block makes the
thread unreadable from both sides. Passes without any other story in this feature.

**Acceptance scenarios**

1. **Given** two signed-in people, **When** A sends B a message, **Then** B's inbox shows
   the conversation with the message and an unread marker.
2. **Given** A does not follow B and has never messaged them, **When** A sends the first
   message, **Then** it appears in B's **Requests** inbox and generates no notification.
3. **Given** B accepts the request, **When** A sends a second message, **Then** it appears
   in B's main inbox and does generate a notification.
4. **Given** an open conversation, **When** B blocks A, **Then** neither can read the
   thread or send into it, and neither is told which of the two acted.
5. **Given** a conversation containing a shared post, **When** the post's author changes
   its visibility to private, **Then** the shared post is no longer resolvable inside the
   conversation for anyone but the author, immediately.
6. **Given** any message, **When** a participant reports it, **Then** it enters the same
   moderation queue as posts and comments, and the moderation action is recorded.

---

### User Story 2 - A post can be about a place (Priority: P1)

A person publishing a photo of a meal attaches the restaurant it was eaten at. The
restaurant has a page: its name, category, address, the interests it sits under, and the
posts filed to it that the viewer is permitted to see. Somebody else looking for that
restaurant finds it by name instead of creating a duplicate.

**Why this priority**: the owner's second named ask, and the one that most changes the
data model. Doing it after chat would mean two migrations of the same repositories.

**Independent test**: create a place, attach it to a post at publish time, open the place
page as a second identity and see the post; open it signed out and see only public posts.

**Acceptance scenarios**

1. **Given** a person composing a post, **When** they search for a place by name, **Then**
   matching existing places appear as they type, with category and locality shown, so they
   can attach the existing one rather than create a duplicate.
2. **Given** no match exists, **When** they create a place with a name, category and
   locality, **Then** it is created and attached, and near-identical existing names in the
   same locality are shown first so they can choose one instead (mirrors 001/FR-023).
3. **Given** a place with posts, **When** anyone opens its page, **Then** they see only the
   posts that post visibility permits them — identical to every other surface.
4. **Given** a person follows a place, **When** a post is published to that place in an
   interest they do **not** follow, **Then** that post does **not** appear in their home
   feed. *(The negative case. This is FR-033's shape and it is the test that keeps
   Principle I honest for places.)*
5. **Given** a place name that violates the content policy, **When** anyone reports it,
   **Then** it enters the moderation queue and can be renamed or retired.
6. **Given** a photo carrying EXIF GPS, **When** it is published, **Then** the stripped
   coordinates are not used to suggest, attach, or infer a place.

---

### User Story 3 - An interest page is worth opening (Priority: P2)

Somebody lands on "Ramen" from search. Today they get a list of posts. They should get
what the interest *is*, how many people are in it, its sub-interests laid out, the
choice between newest and most-engaged, and the ability to search within it.

**Why this priority**: the interest page is the product's centre and it is currently the
thinnest screen in the app. But nothing is broken, so it ranks below the two new surfaces.

**Independent test**: open an interest with a description, sub-interests and 30 posts;
switch New/Top; search within it; all against the existing interest fixtures.

**Acceptance scenarios**

1. **Given** a top-level interest, **When** it is opened, **Then** its description,
   follower count and its sub-interests are shown alongside its posts.
2. **Given** an interest space, **When** the viewer switches to "Top", **Then** posts are
   ordered by engagement within a bounded recent window, and the set of posts shown is
   identical to the set "New" would show. *(Ordering may change; membership may not.)*
3. **Given** an interest with many posts, **When** the viewer searches within it, **Then**
   results are restricted to that interest and its sub-interests.

---

### User Story 4 - Close the holes in what already shipped (Priority: P2)

Three things were declared done and are not.

**Why this priority**: FR-049 is a privacy-adjacent promise the product currently breaks
by omission — a person cannot turn any notification off. Cheap, and a correctness matter
rather than a feature.

**Independent test**: each is independently verifiable against the existing suites.

**Acceptance scenarios**

1. **Given** a person who has turned off reaction notifications, **When** somebody reacts
   to their post, **Then** no notification is created for them, and comment and follow
   notifications still are. *(001/FR-049)*
2. **Given** a real video file, **When** it is published, **Then** it is transcoded, a
   poster frame is shown before playback, and it plays on the Android runtime.
   *(001/FR-005, FR-009 — currently unverified for want of a fixture.)*
3. **Given** a partial handle or display name, **When** it is searched, **Then** matching
   people are returned, excluding blocked people in both directions.

---

### User Story 5 - Save a post to come back to (Priority: P3)

A person saves a post and finds it again later on their own profile. Saves are private.

**Why this priority**: smallest of the five, and the only one with no new hazard. It is
here because it is the cheapest thing on this list that a person would notice missing.

**Independent test**: save, list, unsave; a second identity cannot see the first's saves.

**Acceptance scenarios**

1. **Given** any post the viewer can see, **When** they save it, **Then** it appears in
   their saved list and nowhere anyone else can read.
2. **Given** a saved post whose visibility later excludes the saver, **When** they open
   their saved list, **Then** the post is not shown. *(A save is a bookmark, not a copy.)*

---

### Edge Cases

- A conversation with a person who then deletes their account: the thread becomes
  read-only and the departed participant is shown as unavailable, matching the treatment
  of their posts.
- Two people create the same restaurant within seconds of each other. Duplicate places
  are a moderation-mergeable condition, exactly as duplicate sub-interests are (001/FR-030).
- A place is attached to a post whose interests are later changed. The place attachment
  survives; the post's feed membership follows the new interests.
- A message sent to somebody who has blocked the sender: refused with a response
  indistinguishable from "cannot be reached", so a block is not disclosed.
- A message containing only a shared post whose visibility excludes the recipient: the
  message exists, the post does not resolve, and the recipient sees "not available to you"
  rather than an empty bubble.
- An interest page "Top" tab on an interest with fewer posts than one page: identical to
  "New", not an error.
- A place with zero posts: browsable, with an empty state (001/FR-036's shape).

## Requirements *(mandatory)*

### Functional Requirements — conversations (US1)

- **FR-001**: System MUST let a signed-in person open a one-to-one conversation with
  another person and send text messages into it.
- **FR-002**: System MUST persist messages durably, so a conversation survives a restart
  of the service and of the app.
- **FR-003**: System MUST present a person's conversations as two inboxes: accepted
  conversations, and **requests** — a conversation whose first message came from somebody
  the recipient does not follow.
- **FR-004**: System MUST NOT generate a notification for a message in a request
  conversation until the recipient accepts it.
- **FR-005**: System MUST let a recipient accept, decline, or delete a request; a declined
  sender MUST NOT be told they were declined.
- **FR-006**: System MUST sever a conversation in both directions when either participant
  blocks the other: neither may read it or send into it, and neither is told who acted.
- **FR-007**: System MUST let a participant report a message, entering the same moderation
  queue and audit log as posts, comments and interest names.
- **FR-008**: System MUST rate-limit message sending, per sender and per recipient.
- **FR-009**: System MUST let a person share a post into a conversation, and MUST resolve
  that post for each reader through the same visibility boundary as every other surface,
  at read time.
- **FR-010**: System MUST mark messages read and show unread counts per conversation.
- **FR-011**: System MUST deliver new messages to an open conversation without the reader
  taking an action, within a stated latency budget.
- **FR-012**: Conversations MUST NOT contribute to, reorder, or widen any feed, interest
  space, place page, or profile, and message activity MUST NOT influence ranking anywhere.
  *(Constitution I. This requirement exists to be tested negatively.)*

### Functional Requirements — places (US2)

- **FR-013**: System MUST let a signed-in person create a place with a name, a category
  (restaurant, café, bar, shop, venue, outdoor, other), and a locality.
- **FR-014**: System MUST surface existing places with similar names in the same locality
  while a person is creating one, so they can attach the existing place instead.
- **FR-015**: System MUST let a person attach at most one place to a post at publish time,
  and MUST let the author add, change or remove it afterwards.
- **FR-016**: System MUST provide a browsable page per place showing its name, category,
  locality, the interests its posts are filed under, and its posts.
- **FR-017**: System MUST enforce post visibility on a place page identically to every
  other surface, through the same single boundary.
- **FR-018**: System MUST let a person follow and unfollow a place.
- **FR-019**: System MUST restrict posts reaching a viewer's home feed by way of a followed
  place to those published in interests the viewer also follows. Following a place MUST NOT
  introduce posts from interests the viewer has not chosen. *(Constitution I; the analogue
  of 001/FR-033, and verified by the same shape of negative test.)*
- **FR-020**: System MUST apply the content policy to place names and allow a place to be
  reported; operators MUST be able to rename, merge and retire places, carrying posts and
  followers across without orphaning content.
- **FR-021**: System MUST NOT derive, suggest, or attach a place from location metadata
  embedded in uploaded media. A place attachment is an explicit act by the author or it
  does not happen. *(Constitution III, against 001/FR-010.)*
- **FR-022**: System MUST let a person search places by name, with results appearing as
  they type, showing each place's category and locality.
- **FR-023**: System MUST show, on a post, the place it is attached to, linking to that
  place's page.
- **FR-024**: A place MUST NOT be required. A post with no place behaves exactly as it does
  today.

### Functional Requirements — interest depth (US3)

- **FR-025**: System MUST let operators set and edit a description for a top-level interest,
  and the creator or an operator for a sub-interest.
- **FR-026**: System MUST show an interest's follower count and its sub-interests on its page.
- **FR-027**: System MUST offer an interest space ordered by recency and, alternatively, by
  engagement within a bounded recent window.
- **FR-028**: An alternative ordering MUST NOT change which posts are shown — only their
  order. *(Constitution II: ranking may not become a second visibility decision.)*
- **FR-029**: System MUST let a person search posts within an interest and its sub-interests.
- **FR-030**: System MUST apply the content policy to interest descriptions and allow them
  to be reported.

### Functional Requirements — closing shipped gaps (US4)

- **FR-031**: System MUST let a person turn each category of notification (reaction,
  comment, follow, message) off and on independently, and MUST NOT create a notification in
  a category the recipient has turned off. *(Delivers 001/FR-049.)*
- **FR-032**: System MUST expose a person's notification preferences to them and persist
  changes across sessions and devices.
- **FR-033**: System MUST demonstrate the video path end to end — upload, transcode, poster
  frame, playback on the Android runtime — against a real video file.
  *(Verifies 001/FR-005 and 001/FR-009, which have never been exercised.)*
- **FR-034**: System MUST let a person search for people by handle and display name.
- **FR-035**: People search results MUST exclude people the searcher has blocked and people
  who have blocked the searcher, in both directions.
- **FR-036**: People search MUST NOT reveal a person whose account is not active.

### Functional Requirements — saved posts (US5)

- **FR-037**: System MUST let a person save and unsave any post they can currently see.
- **FR-038**: A person's saved posts MUST be readable only by that person.
- **FR-039**: A saved post MUST be resolved through the visibility boundary at read time; a
  post the saver may no longer see MUST NOT appear in their saved list.

### Cross-cutting requirements

- **FR-040**: Every new surface that can return a post — the place page, the saved list, a
  post shared into a conversation, and in-interest post search — MUST be enumerated in the
  visibility matrix contract and MUST hold the full matrix. *(Constitution II.)*
- **FR-041**: Conversation membership MUST be decided in exactly one place. No read or write
  path may construct its own membership predicate. *(Constitution II's rationale, applied to
  a non-post read path.)*
- **FR-042**: Every new content type introduced here — messages, place names, interest
  descriptions — MUST be reportable and moderatable in the same release that introduces it,
  with decisions recorded in the existing append-only audit log. *(Constitution IV.)*
- **FR-043**: Every requirement in this feature MUST be satisfiable and testable on the
  `local` runtime profile with no cloud account and no credentials.
- **FR-044**: Where the local implementation of a capability introduced here differs from
  the implementation a hosted deployment would use, the divergence MUST be registered and
  MUST NOT be reported as verified for the hosted path. *(Constitution V.)*

### Key Entities

- **Conversation** — a pair of participants, a state (`requested`, `accepted`, `declined`,
  `severed`), the time of the last message, and per-participant read position.
- **Message** — belongs to a conversation; an author, a body, an optional shared post
  reference, a created time, and a moderation state.
- **Place** — a name, a category, a locality, an optional address, a creator, a status
  (`active`, `merged`, `retired`), and a merge target when merged.
- **Place Follow** — a person and a place.
- **Post ↔ Place attachment** — at most one place per post; the index that makes a place
  page listable.
- **Notification Preference** — per person, one on/off per notification category.
- **Saved Post** — a person and a post, private to that person.
- **Interest Description** — text on an existing interest; content, therefore reportable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A message sent by one person is readable by the other within **2 seconds**
  with the conversation open, measured over HTTP against a running service.
- **SC-002**: A conversation and its messages survive a full restart of the service and of
  the app with no message lost and no ordering change.
- **SC-003**: A first message from a non-followed person produces **zero** notifications
  for the recipient until accepted.
- **SC-004**: After a block, **100%** of read and write attempts on the conversation from
  both sides are refused, and the refusals are indistinguishable from "cannot be reached".
- **SC-005**: The visibility matrix passes on **every** surface including the four new
  ones — 7 post states × 6 viewer relationships × 11 surfaces, generated from the table.
- **SC-006**: With a place followed and its interest **not** followed, a post published to
  that place appears in the follower's home feed **zero** times, asserted directly.
- **SC-007**: Creating a place whose name closely matches an existing place in the same
  locality surfaces that existing place **before** the create action in every case in the
  fixture set.
- **SC-008**: No place is ever attached to a post without an explicit author action —
  asserted by publishing media carrying EXIF GPS and observing no place on the result.
- **SC-009**: Switching an interest space between orderings changes order only; the set of
  post ids returned is **identical**.
- **SC-010**: With a notification category turned off, **zero** notifications in that
  category are created, and other categories are unaffected.
- **SC-011**: A real video file completes upload → transcode → poster → playback on the
  Android runtime, evidenced by a run record. *(Closes a 001 criterion never met.)*
- **SC-012**: People search excludes blocked people in both directions in **100%** of cases
  in the block fixture set.
- **SC-013**: A post that the saver may no longer see appears in their saved list **zero**
  times.
- **SC-014**: Every criterion above is met on the `local` profile with no cloud account.

### Explicitly not claimable from this feature

- **Push notification delivery to a device that is not in the foreground.** It needs a
  push service bound to an account. Out of scope; report as **not delivered**, not as
  "works in the app".
- **Anything about real usage** — whether people message each other, whether places get
  created, retention. Unchanged from 003: nobody has used the product.
- **Behaviour at concurrency.** 003 measured the ceiling as DynamoDB Local (882 req/s).
  Chat adds a read-heavy poll path on top of that. No local run can settle it.

## Assumptions

- **One-to-one conversations only.** Group chat multiplies the membership, moderation and
  read-state surface and is not needed to answer "can two people talk". Out of scope below.
- **Text and shared posts only in messages.** Sending media into a conversation would
  create a second upload path with its own moderation and stripping obligations; it is a
  follow-on, not a v1.
- **A restaurant is a category of Place, not its own entity.** Building "restaurant" as the
  type makes every later venue a special case. The owner asked for a restaurant page; this
  delivers it as `category=restaurant` with a page shaped for it.
- **Places are searched by name and locality, not by proximity.** "Near me" needs a
  geospatial index the current datastore makes expensive; see the plan's research record.
- **A place-follow is offered.** It could have been withheld to sidestep the Principle I
  hazard entirely; instead FR-019 constrains it and SC-006 tests the negative, which is
  the same treatment 001 gave person-follow.
- **The existing hand-rolled navigation shell is extended**, not replaced. It is the one
  that has been driven on a device.

## Dependencies

- **The datastore decision (`003/datastore-decision.md`) is a gate, not a dependency.**
  This feature adds roughly five repositories to the thirteen that already exist. Starting
  it before the decision doubles whatever migration the decision implies. This is the
  strongest scheduling argument in this document.
- FR-011's delivery latency depends on a transport choice recorded in research.
- FR-033 (video) needs a real video fixture committed to the repository.
- Nothing here needs hosting to be built or tested; chat is the feature that will most
  obviously want it afterwards.

## Out of Scope

- Group conversations, message reactions, typing indicators, read receipts shown to the
  sender, voice or video calls.
- Media attachments inside messages.
- Proximity / "near me" place search, maps, and directions.
- Ratings, reviews, opening hours, menus, and bookings on a place page. A place page here
  shows the posts filed to it. Reviews are a distinct content type with their own
  moderation and abuse profile and deserve their own spec, not a subsection of this one.
- Push notifications to a backgrounded device (needs an account-bound push service).
- Post-content full-text search across the whole product (001/D3 leaves this to a later
  search backend; FR-029 is scoped to within an interest).
- Stories, ephemeral content, live streaming, ads, monetisation.
