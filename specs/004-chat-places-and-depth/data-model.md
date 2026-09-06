# Data Model: Conversations, places, and the depth the product is missing

**Feature**: `004-chat-places-and-depth` | **Date**: 2026-09-06

Extends `specs/001-interest-media-sharing/data-model.md`. Same single table, same overloaded
keys, same discipline: **every item below exists to serve a numbered access pattern, and
nothing else.** 001/D9 stands — the datastore still has no adapter.

Access-pattern numbering continues from 001's A20. FR references are to this feature's
`spec.md` unless prefixed `001/`.

## New access patterns

| # | Pattern | Requirement | Served by |
|---|---|---|---|
| A21 | List a person's accepted conversations, most recent first | FR-003 | **GSI5** |
| A22 | List a person's request conversations, most recent first | FR-003 | **GSI5** |
| A23 | Get a conversation's state and participants | FR-001, FR-006, FR-041 | Main table, point read |
| A24 | List messages in a conversation, newest after a cursor | FR-001, FR-010, FR-011 | Main table, Query on the conversation partition |
| A25 | Get a place by id | FR-016 | Main table, point read |
| A26 | Get a place by name within a locality (dedupe) | FR-014 | GSI1 |
| A27 | List the places in a locality, by name (catalogue cache) | FR-014, FR-022 | **GSI3**, reused |
| A28 | List recent posts attached to a place | FR-016 | Main table, Query on the place partition |
| A29 | List the places a person follows | FR-018 | Main table, Query |
| A30 | Is this person following this place? | FR-018 | Main table, point read |
| A31 | List followers of a place (counts) | FR-016 | **GSI4**, reused |
| A32 | List a person's saved posts, most recently saved first | FR-037 | Main table, Query |
| A33 | Is this post saved by this person? | FR-037 | Main table, point read |
| A34 | Find people by handle or display-name prefix | FR-034 | GSI1 prefix Query |

A23 and A30 are point reads for the same reason 001's A7/A10/A18 are: they sit on a hot
path that runs per request, and `ConversationAccess` (research R2) evaluates A23 on every
message read and every send.

## Key schema changes

One new index. Everything else reuses what exists.

| Attribute | Role |
|---|---|
| `gsi5pk` / `gsi5sk` | **GSI5 — Inbox**: a person's conversations, split by state, ordered by last message |

`gsi5pk = PERSON#<personId>#<state>` and `gsi5sk = <lastMessageAt>`. Putting `state` in the
partition key is what makes A21 and A22 one query each instead of one query and a filter.
`lastMessageAt` is a GSI sort key, so it is updated by **writing the attribute** — no
delete-and-reinsert, which is the trap in the more obvious `sk = CONV#<lastMessageAt>#...`
layout on the base table (research R8).

Projection: `KEYS_ONLY` plus `conversationId`, `otherPersonId`, `state`, `lastMessageAt`,
`lastReadAt`, `unreadCount`, `lastMessagePreview` — so an inbox renders without a
follow-up fetch per row, matching 001's rule for the other four indexes.

---

## Entities

### Conversation (meta)

```
pk  = CONV#<conversationId>
sk  = META
```

`conversationId` is **derived**: a hash of the two person ids sorted. There is exactly one
conversation per pair by construction, so opening one is idempotent and needs no uniqueness
item and no transaction (research R8).

| Field | Type | Notes |
|---|---|---|
| `participantIds` | [ULID, ULID] | Sorted. The derivation input. |
| `state` | enum | `requested` \| `accepted` \| `declined` \| `severed` |
| `initiatorId` | ULID | Who sent first — decides who may send while `requested` (FR-005) |
| `lastMessageAt` | ISO-8601 | Authority; the participant rows denormalise it |
| `createdAt` | ISO-8601 | |

**This item is the single authority for `state`.** The participant rows carry a copy for
the inbox query; on disagreement this item wins. `ConversationAccess` reads *this* item,
never a participant row (research R2).

### Conversation participant (inbox row)

```
pk  = PERSON#<personId>
sk  = CONV#<conversationId>
```

Two per conversation, one per participant.

| Field | Type | Notes |
|---|---|---|
| `conversationId`, `otherPersonId` | ULID | |
| `state` | enum | Denormalised from the meta item — see the consistency rule below |
| `lastMessageAt` | ISO-8601 | `gsi5sk` |
| `lastReadAt` | ISO-8601 | FR-010 |
| `unreadCount` | number | FR-010; a counter, not a computed scan |
| `lastMessagePreview` | string ≤ 140 | So the inbox renders from the index alone |

**Consistency rule**: a state change (accept, decline, block-sever) writes the meta item and
**both** participant rows in one `TransactWriteItems`. The set is fixed at three items, so it
is always within limits. A message send writes the message and both participant rows —
also three, also one transaction.

### Message

```
pk  = CONV#<conversationId>
sk  = MSG#<ulid>
```

ULID sort keys give creation order for free, which is what makes A24 a cursor Query.

| Field | Type | Notes |
|---|---|---|
| `authorId` | ULID | |
| `body` | string ≤ 2000 | Content — reportable (FR-007, FR-042) |
| `sharedPostId` | ULID? | FR-009. **A reference, never a copy.** |
| `moderationState` | enum | `visible` \| `removed` — mirrors the post treatment |
| `createdAt` | ISO-8601 | |

`sharedPostId` being a reference rather than an embedded snapshot is what makes FR-009
possible at all: the post is resolved through `VisibilityFilter` per reader at read time, so
a later visibility change lands inside the conversation immediately (Constitution II). A
denormalised caption or thumbnail on this item would be a materialised copy that outlives a
visibility change — forbidden without an amendment.

### Place

```
pk  = PLACE#<placeId>
sk  = META
```

| Field | Type | Notes |
|---|---|---|
| `name` | string ≤ 120 | Content — reportable (FR-020) |
| `nameLower` | string | `gsi3sk`; the dedupe and search key |
| `category` | enum | `restaurant` \| `cafe` \| `bar` \| `shop` \| `venue` \| `outdoor` \| `other` |
| `locality` | string | Free-form city/area label; `gsi3pk` component |
| `address` | string? | Optional, author-supplied text. **Never coordinates derived from media.** |
| `createdBy` | ULID | |
| `status` | enum | `active` \| `merged` \| `retired` |
| `mergedIntoPlaceId` | ULID? | Set when `status = merged` (FR-020) |
| `followerCount`, `postCount` | number | Counters |

Indexes: `gsi1pk = PLACESLUG#<locality>#<slug(name)>` for A26; `gsi3pk = PLACES#<locality>`,
`gsi3sk = <nameLower>` for A27. GSI3 is 001's **Hierarchy** index — "children under a
parent" — and places under a locality is exactly that shape, so no new index is needed.

**There is no latitude/longitude field.** Adding one without an index that uses it is
storage pretending to be a capability; proximity search is deferred with its reasons in
research R4.

### Post ↔ Place index item

```
pk  = PLACE#<placeId>
sk  = POST#<createdAt>#<postId>
```

Structurally identical to 001's Post–Interest index item, deliberately (research R9). At most
**one** per post — a post has at most one place (FR-015).

| Field | Type | Why it is duplicated here |
|---|---|---|
| `postId`, `authorId` | ULID | Ranking without a fetch |
| `visibility` | enum | `VisibilityFilter` runs on Query results directly |
| `processingState` | enum | Excludes not-yet-ready posts from the place page |

**Consistency rule — this widens an existing transaction.** 001's rule says a visibility
change (001/FR-017) updates the post item and its interest index items in one
`TransactWriteItems`. That transaction now also carries the place index item when one
exists. The set stays bounded (at most two interest index items per assigned interest, plus
at most one place item), so it stays within limits — but the transaction site in
`PostRepository` is a **single-owner file** for this feature and must not be edited by two
lanes at once.

### Place Follow

```
pk  = PERSON#<personId>
sk  = PLACEFOLLOW#<placeId>
```

`gsi4pk = PLACE#<placeId>`, `gsi4sk = PERSON#<personId>` — GSI4 is 001's **Inverted** index
and serves A31 unchanged.

| Field | Type | Notes |
|---|---|---|
| `followedAt` | ISO-8601 | |

**What this item does not do**: it is *not* read by the home feed's candidate assembly.
FR-019 is satisfied by the feed never asking this question — a followed place contributes
candidates only through interests the viewer already follows. Stated here because the item
existing is exactly what would tempt a later change to consult it.

### Saved Post

```
pk  = PERSON#<personId>
sk  = SAVE#<savedAt>#<postId>
```

Private by key: no index projects it, and no read path other than the owner's own list can
reach it (FR-038). A34's list is handed to `VisibilityFilter` like any other candidate set,
so FR-039 needs no additional field.

| Field | Type | Notes |
|---|---|---|
| `postId`, `authorId` | ULID | |
| `visibility`, `processingState` | enum | Denormalised so the filter runs on Query results |

A point-read companion `sk = SAVEDBY#<postId>` serves A33 ("is this saved?") without scanning
the list.

### Notification Preference

**No new item.** Four booleans on the existing Person item:

```
notificationPrefs = { reaction: bool, comment: bool, follow: bool, message: bool }
```

Absent means on, so existing rows need no backfill. The notification builder already reads
the recipient's Person item, so enforcement at creation (research R10) costs no extra read.

### Interest description

**No new item.** Two fields on the existing Interest item:

| Field | Type | Notes |
|---|---|---|
| `description` | string ≤ 500 | Content — reportable (FR-030) |
| `descriptionUpdatedAt` | ISO-8601 | |

`Report` gains `interest-description` as a subject type; `ModerationAction` needs no change.

---

## State transitions

### Conversation

```
          first message from a followed person
  (none) ─────────────────────────────────────► accepted
     │                                              ▲
     │  first message from a non-followed person    │ recipient accepts
     └────────────────────────────► requested ──────┘
                                        │
                                        │ recipient declines
                                        ▼
                                    declined
  any state ──── either party blocks the other ────► severed
```

- `requested`: readable by the recipient, produces **no** notification (FR-004). The
  initiator may send exactly one message until it is accepted (FR-005, FR-008).
- `declined`: the initiator sees a conversation that behaves as though delivery simply is
  not happening. They are **not** told (FR-005) — the same reasoning that makes a block
  return 404 rather than 403 in 001's visibility contract.
- `severed`: neither party may read or write (FR-006). Unblocking returns the conversation
  to its prior state; the messages were never deleted.

### Place

```
  active ──── operator merges ────► merged (mergedIntoPlaceId set; posts and followers move)
     │
     └──────── operator retires ───► retired (page readable, no new attachments)
```

Mirrors 001/FR-030's sub-interest treatment exactly, including the rule that nothing is
orphaned.

---

## Validation rules by requirement

| Rule | Requirement |
|---|---|
| A conversation exists for exactly one unordered pair of distinct, active people | FR-001 |
| A message body is 1–2000 characters, or empty only when `sharedPostId` is set | FR-001, FR-009 |
| No message may be written while `state ∈ {declined, severed}` | FR-005, FR-006 |
| At most one unanswered message while `state = requested` | FR-005, FR-008 |
| `sharedPostId` is stored unresolved; the post is filtered per reader at read time | FR-009, FR-040 |
| A place name is 1–120 characters and passes the content policy | FR-013, FR-020 |
| `(locality, slug(name))` is unique among `active` places | FR-014 |
| A post carries at most one `placeId`, and only one the author set explicitly | FR-015, FR-021 |
| No write path may set `placeId` from media metadata | **FR-021** |
| A place index item is written in the same transaction as the post | FR-016, 001/FR-017 |
| A saved-post row is written and read only under the owner's own partition | FR-038 |
| A notification is not written when the recipient's preference for its category is false | FR-031 |
| An interest description is ≤ 500 characters and is reportable | FR-025, FR-030 |

---

## What is deliberately not modelled

- **Group conversations.** No `participants` collection, no per-member roles, no
  membership item. Adding two people to the pair-derived id (research R8) is a rewrite of
  conversation identity, which is the honest cost and the reason it is out of scope rather
  than "later".
- **Typing indicators and delivery receipts.** They are ephemeral state, and this table has
  no ephemeral tier. They would need a different store, which is a decision, not a field.
- **Coordinates on a Place.** See above.
- **A per-message read receipt.** `lastReadAt` on the participant row answers "how many
  unread" (FR-010) in one number. Per-message receipts are a different requirement nobody
  has written.
- **A denormalised copy of a shared post inside a message.** Forbidden by Constitution II,
  and the reason is written next to `sharedPostId` above so it is not rediscovered as a
  performance idea.
