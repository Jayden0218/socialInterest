# Research: Conversations, places, and the depth the product is missing

**Feature**: `004-chat-places-and-depth` | **Date**: 2026-09-06

Phase 0 output. Each decision below resolves an unknown in the plan's Technical Context.
The alternatives are recorded because 001's `research.md` earned its keep exactly there —
several of its decisions look arbitrary until you read what was rejected.

---

## R1 — Message delivery uses HTTP long-polling on the existing server

**Decision**: A client with a conversation open issues `GET /v1/conversations/{id}/messages?after={cursor}&wait=25`.
The server resolves it immediately if anything is newer than the cursor; otherwise it holds
the request open for up to 25 seconds, returning the moment the existing `DurableEventBus`
emits `message.created` for that conversation, and returning an empty page on timeout. The
client re-issues. No second protocol, no new dependency.

**Rationale**:

- Delivery is sub-second, comfortably inside SC-001's 2-second budget, with **one** in-flight
  request per open conversation rather than one request per second per conversation.
  Against a datastore measured at 882 req/s (003/R1) that difference is the whole margin.
- Every assertion stays an ordinary HTTP request, so `apps/e2e` drives it unchanged. 002
  established that the only tests which have ever found a real defect in this product are
  the ones that make a request; a transport the e2e harness cannot drive would forfeit that.
- The event bus that makes the immediate return possible already exists and is already
  durable, including replay-on-restart (003).

**Alternatives considered**:

| Option | Rejected because |
|---|---|
| Fixed-interval polling (1–2s) | Worse latency *and* more load — the two things you would trade between. Strictly dominated by long-poll. |
| WebSocket (`@nestjs/websockets` + RN's built-in `WebSocket`) | A second server protocol with its own auth, reconnection and backoff, none of which the e2e harness speaks. RN's WebSocket needs no native module, so this is not a dependency objection — it is a "two protocols, one of them untested" objection. Revisit when a hosted deployment exists and long-poll's held connections become a real cost. |
| Server-Sent Events | React Native's `fetch` does not expose a readable stream; SSE needs a polyfill. The `expo-image-picker` failure (a wrong-versioned native-adjacent dependency that killed the app at startup and cost a device run to find) is the argument against adding one for a transport that long-poll already covers. |

**Divergence to register (Constitution V)**: a hosted deployment will not serve chat by
holding HTTP connections. Long-poll passing locally is **not** evidence that a hosted
transport works. Record in `docs/verification/divergence-register.md`.

---

## R2 — Conversation membership is decided in exactly one place

**Decision**: A `ConversationAccess` module at the top level of the API, structurally
identical to `VisibilityFilter`: it takes a viewer and a conversation and returns whether
the viewer may read it, write into it, or neither. Every path — the message list, the send
handler, the inbox, the notification builder, the moderation queue — calls it. A
table-driven test enumerates the states.

**Rationale**: Constitution II is written about post reads, so it does not *bind* here. Its
rationale does: "six independently written predicates give six chances to leak, and the leak
is silent and privacy-affecting." A conversation is the most private thing this product will
hold. Applying the same discipline to it is cheaper than the amendment that would follow the
first leak.

**Alternatives considered**: a Nest guard on the conversation controller — rejected because a
guard covers the HTTP entry point and nothing else. The notification builder, the moderation
queue and any future digest do not pass through it, and those are precisely the paths that
leaked in 002.

---

## R3 — A Place is a new entity, not a sub-interest

**Decision**: `Place` is a first-class entity with its own page, its own follow, and its own
attachment to a post. It is **not** modelled as a sub-interest under "Food".

**Rationale**: the tempting version — "a restaurant is just a sub-interest" — reuses
everything and is wrong for three separate reasons:

1. **001/FR-024**: a post published to a sub-interest also appears in its parent interest's
   space. Every restaurant post would therefore land in "Food", for everyone who follows
   Food, worldwide. That is feed-widening by construction — the thing Principle I exists to
   prevent — arrived at without anyone deciding to do it.
2. **The catalogue becomes unbounded.** Interests are a curated two-level set small enough to
   hold in memory (001/D3). Places are every venue anybody ever eats at. Merging them
   destroys the property that makes interest search cheap.
3. **An interest is a topic you choose in order to shape your feed. A place is a referent a
   post points at.** They answer different questions and carry different fields (category,
   locality, address).

The one-line shape of the design: **a Place is to a Post what an Interest is, minus feed
membership.** Same attachment, same index item, same visibility treatment, same moderation —
and deliberately not a feed source. FR-019 is where that "minus" is enforced.

**Alternatives considered**: a free-text location string on the post (rejected: no page, no
dedupe, no moderation handle, and "Joe's" typed forty ways); a third-party place directory
such as Google Places or Foursquare (rejected: account-bound and billable, which the cost
constraint forbids without specific approval, and it would put a hosted dependency in the
publish path).

---

## R4 — Places are found by name within a locality; proximity search is deferred

**Decision**: place lookup reuses the `CatalogueSearch` interface behind a locality-scoped
index, with a prefix query on a GSI as the fallback beyond the cached set. No geospatial
index, no "near me", no map.

**Rationale**: this is 001/D3's friction showing up again in a new place, and the same answer
applies — concentrate it behind one interface. Proximity search on DynamoDB means a geohash
GSI and prefix range queries: doable, and a sub-project. **Building a geohash index into a
datastore whose selection is formally pending (003/`datastore-decision.md`) is work that may
be thrown away.** PostgreSQL with PostGIS would make it nearly free, which is precisely why
the decision should come first.

**Alternatives considered**: OpenSearch (rejected on cost posture, same as 001/D3);
client-side distance filtering over a fetched set (rejected: it is a visibility-shaped
mistake — the client filtering a set the server already returned).

---

## R5 — An unsolicited first message lands in a Requests inbox

**Decision**: a conversation opened by somebody the recipient does not follow starts in state
`requested`. It is readable by the recipient in a separate inbox, generates no notification,
and the sender may send exactly one message until it is accepted. Accepting moves it to
`accepted`; declining moves it to `declined` and the sender is not told.

**Rationale**: Constitution IV requires safety controls to ship *with* the feature. Chat's
abuse vector is the unsolicited first message, and the request inbox is the control that
addresses it at the point of arrival rather than after a report. The "sender is not told"
detail matters for the same reason a block returns 404 rather than 403 in
`contracts/visibility-matrix.md`: a declined sender who knows they were declined has a
reason to come back with another account.

**Alternatives considered**: anyone may message freely (rejected: ships the abuse vector and
defers the control, which Principle IV names as the thing that never happens); mutual-follow
only (rejected: in a product where the whole premise is meeting strangers through a shared
interest, this makes chat useless to the case it exists for).

---

## R6 — The hand-rolled navigation shell is extended, not replaced

**Decision**: add a fifth tab (`Chats`) and seven routes to the existing `Route` union in
`apps/mobile/src/App.tsx`. Do not adopt `react-navigation`.

**Rationale**: the hand-rolled shell is the one that has been driven on an Android device
through ten journeys. `react-navigation` brings `react-native-screens` and
`react-native-safe-area-context`, both native modules, into a build whose native-module
history is one wrong version killing the app during module registration with
`NoClassDefFoundError`. That cost a device run to find. The shell's cost is that `App.tsx`
grows — real, bounded, and visible in review.

Places live **inside Discover** (one search across interests and places) rather than taking a
sixth tab. Five tabs is the ceiling.

**Alternatives considered**: adopt `react-navigation` now (rejected for this feature; the
right trigger is deep-linking or a genuine nested-stack requirement, neither of which this
feature has — the share-link handler in `App.tsx` already covers the one deep link that
exists); a second shell for chat (rejected outright: two navigation models in one app).

---

## R7 — "Top" ranks the set "New" would return; it never runs a different query

**Decision**: the alternative ordering takes the candidate set the recency query produced,
passes it through `VisibilityFilter` exactly as today, and reorders the survivors with the
existing `rank()` shape. There is no second query and no second visibility decision.

**Rationale**: 002 and 003 between them found the same defect five times — a read path
sending `VisibilityFilter`'s candidate rows, or constructing its own predicate, instead of
using the filter for what it decides and nothing else. An ordering that fetches its own set
is that defect wearing a feature's clothes. SC-009 asserts the id sets are identical, which
makes the rule a test rather than a comment.

**Alternatives considered**: a separate engagement-sorted index item written at reaction time
(rejected: it is a materialised ordering that outlives a visibility change, which Constitution
II forbids introducing without an amendment).

---

## R8 — Conversation identity is derived from the participant pair

**Decision**: `conversationId = hash(sorted([personIdA, personIdB]))`. Opening a conversation
is therefore idempotent — there is exactly one thread per pair, by construction, with no
uniqueness transaction and no race.

Storage on the existing single table:

- Messages: `pk = CONV#{conversationId}`, `sk = MSG#{ulid}` — one query, naturally ordered.
- Participant/inbox rows: `pk = PERSON#{personId}`, `sk = CONV#{conversationId}`, carrying
  `state`, `lastMessageAt`, `lastReadAt`, `unreadCount`, and projected into a new GSI5
  keyed `PERSON#{personId}#{state}` / `{lastMessageAt}`, so the accepted inbox and the
  requests inbox are each one query already in the right order (FR-003).

**Rationale**: the alternative — a generated conversation id plus a uniqueness item — needs a
`TransactWriteItems` on every "open a conversation" and still has to answer "what if both
people tap at once". Deriving the id removes the question. Inbox ordering by
`lastMessageAt` uses a GSI sort key, which is updated by writing the attribute; no
delete-and-reinsert dance, which is the trap in the obvious `sk = CONV#{lastMessageAt}#...`
layout.

**Alternatives considered**: `sk = CONV#{lastMessageAt}#{conversationId}` on the base table
(rejected: every message rewrites the key, meaning delete + put under a transaction, forty
times a conversation); a separate conversations table (rejected: 001/D9 gives the datastore
no adapter and the single-table design is the whole point).

---

## R9 — A place page reuses the Post–Interest index item shape exactly

**Decision**: `pk = PLACE#{placeId}`, `sk = POST#{publishedAt}#{postId}`, written in the same
`TransactWriteItems` that already writes the post and its interest index items. The place
page is one query producing candidates, handed to `VisibilityFilter` like any other surface.

**Rationale**: zero new machinery, and the new surface is structurally identical to a surface
the visibility matrix already covers — which is what makes adding it to that contract a
one-row change rather than a new class of test.

---

## R10 — Notification preferences are enforced at creation, not at read

**Decision**: the notification is **not created** when the recipient has that category off.
The list endpoint does no preference filtering.

**Rationale**: FR-031 says "MUST NOT create". Filtering at read leaves the row in the table,
where it leaks through every other reader — a future digest, an unread badge count, a push
sender, an export. That is the same class of mistake as a read path constructing its own
visibility predicate, and it is cheaper to not make it than to find it later. The cost is
that turning a category back on does not retroactively produce the notifications missed
while it was off, which is the correct behaviour anyway.

**Alternatives considered**: filter in the list endpoint (rejected as above); create and mark
suppressed (rejected: stores content the person asked not to receive, for no reader).

---

## R11 — Sequencing: this feature should not start before the datastore decision

**Decision**: recorded as a gate in the plan, not as a task. `003/datastore-decision.md` is
open. This feature adds approximately five repositories (`ConversationRepository`,
`MessageRepository`, `PlaceRepository`, `PlaceFollowRepository`, `SavedPostRepository`) to
the thirteen that exist, plus two transaction sites.

**Rationale**: 001/D9 deliberately gave the datastore no adapter, so the choice is welded
into every repository class. Building five more before the decision is made increases
whatever migration the decision implies by roughly 40%, and R4 additionally identifies work
(a geohash index) that PostgreSQL would make nearly free and DynamoDB would make a
sub-project. This is not an argument for either datastore. It is an argument that the order
matters, and it is the strongest scheduling statement in this planning set.

**Alternatives considered**: build now and migrate later (not rejected — it is the owner's
call, and it is a legitimate choice if shipping something people can use matters more than
migration cost. It is recorded here so the choice is made deliberately rather than by
default).
