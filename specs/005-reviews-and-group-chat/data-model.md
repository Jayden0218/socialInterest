# Data model: place reviews and group conversations

Extends `specs/001-interest-media-sharing/data-model.md` and 004's additions. The same
single table, the same overloaded `pk`/`sk`, and **no sixth index** — every new access
pattern below is mapped onto GSI1–GSI5 or onto the base table, and where that mapping is not
obvious it says why.

Access patterns continue 004's numbering: A35 onward.

## New item types

| `type` | What it is |
|---|---|
| `rating` | One person's 1–5 score for one place, with optional review text |
| `conversation-participant` | **Existing**, but its `state` becomes authoritative (research R2) |

`review` is deliberately **not** a separate item type. A review is text on a rating, and
FR-009 makes the text optional — so a separate item would be an optional child with a
one-to-one relationship to its parent, which is a column.

## Ratings

### Key schema

```
rating:            pk = PLACE#<placeId>       sk = RATING#<userId>
ratingByPerson:    pk = USER#<userId>         sk = RATED#<placeId>
```

**The primary key enforces FR-002 structurally.** At most one rating per person per place,
because a second one writes the same key. This is the same argument as 001's
`reaction: pk = POST#<postId>, sk = REACTION#<userId>` — the constraint lives in the key,
so no code path can violate it and no test needs to prove that every code path checks it.

`ratingByPerson` answers "have I rated this place?" without scanning a place's ratings, and
"what have I rated?" for a future profile surface. It is a base-table item under the
person's own partition, not an index — the same shape as 004's `savedPostBy`.

### Item

| Field | Notes |
|---|---|
| `placeId`, `userId` | |
| `score` | integer 1–5; validated server-side |
| `body` | review text, or `null` (FR-009) |
| `createdAt`, `updatedAt` | |
| `removedByModeration` | boolean; set by a moderator decision (FR-015) |

There is no `visibility` field, deliberately — research R4. A review has no audience
setting; inventing one to satisfy a type signature is how the shape defects in this
codebase happened.

### The aggregate

Two counters on the **existing place item**:

| Field | Notes |
|---|---|
| `ratingSum` | sum of scores that count |
| `ratingCount` | how many count |

**FR-005 falls out of this without a special case**: `ratingCount = 0` is a place nobody has
rated, which is a different value from a low average rather than a zero that has to be
interpreted.

Every write is one `TransactWriteItems` over exactly two items — the rating and the place:

| Operation | Rating item | Place counters |
|---|---|---|
| First rating | put | `+score`, `+1` |
| Replace (FR-002) | put | `+new −old`, `+0` |
| Withdraw (FR-003) | delete | `−score`, `−1` |
| Moderator removal (FR-016, R6) | set `removedByModeration` | `−score`, `−1` |

The replace row is why this is transactional rather than two writes: a crash between "add
the new score" and "subtract the old" leaves a place permanently mis-rated, with nothing
that could detect it afterwards.

### Access patterns

| # | Pattern | How |
|---|---|---|
| A35 | A place's reviews, newest first | Query `pk = PLACE#<placeId>`, `sk` begins `RATING#`, then order by `updatedAt` |
| A36 | Has this person rated this place? | Point read `pk = USER#<userId>`, `sk = RATED#<placeId>` |
| A37 | A place's rating summary | Already on the place item, read by A26/A27 with no extra request |

**A35's honest limit.** The sort key is `RATING#<userId>`, so a place's ratings come back in
user-id order and are sorted by recency in memory. That is fine for a place with tens of
reviews and wrong for one with thousands. It is the same trade 004 made for
`personSearch` — one partition, correct for a product with no users, wrong for one with a
million — and the fix is the same shape: a `RATING#<updatedAt>#<userId>` sort key plus a
uniqueness item, or a real search backend. **Not doing that now is a decision, not an
oversight**, and it is recorded here so the next person does not have to rediscover it.

## Group conversations

### What changes

| Thing | Before | After |
|---|---|---|
| `conversationId` for 2 people | `sha256(sorted pair)`, 26 hex | **Unchanged** (FR-026) |
| `conversationId` for 3+ | — | ULID |
| `participantIds` | exactly 2 | 2 to 20 (research R3) |
| Authority for `state` | the conversation item | **the participant item** (research R2) |
| `otherUserId` on a participant row | the other person | `null` for groups |
| `name` | — | optional, on the conversation item |

### The state move

`ConversationParticipantItem` already carries `state`, and `conversationInbox` already puts
it in the GSI5 partition key:

```
conversationInbox: gsi5pk = USER#<userId>#<state>    gsi5sk = TS#<lastMessageAt>
```

So the per-participant state is **already** what the inbox reads. The conversation item's
`state` was a denormalised copy that only stayed honest because a pair has one shared state.
This change removes the copy; it does not add a mechanism. A group genuinely has no single
state — Alice accepted, Bob has not looked, Jo declined — so there is no value the
conversation item could hold that is not false about somebody.

### Item changes

Conversation item gains:

| Field | Notes |
|---|---|
| `kind` | `'pair'` or `'group'`. Explicit, not inferred from `participantIds.length` — the two ids are derived differently and a length check would be a second way to answer a question the id scheme already answers |
| `name` | optional group name; user-generated content (FR-024) |
| `nameRemovedByModeration` | R8: the name is blanked, the conversation is not destroyed |
| `creatorId` | who started it; recorded for the moderation log, **not** used for authority — nobody may remove another participant (spec Assumptions) |

Conversation item **loses its authority** for `state`. The field is left in place and stops
being read, so the backfill (R9) and any partially migrated row cannot produce a conversation
nobody can open.

Participant item gains:

| Field | Notes |
|---|---|
| `joinedAt`, `leftAt` | FR-021; a left participant keeps the row so their messages stay attributable |
| `addedBy` | who added them, for FR-030's membership history |

### Membership changes

One `TransactWriteItems`: the conversation item plus one row per participant. Worst case at
the cap is **21 items**, against DynamoDB's limit of 100 (research R3). This is why FR-031's
cap is enforced server-side rather than in the client — above roughly 99 participants a
membership change silently stops being atomic, and a partial write leaves somebody able to
read a conversation they left.

### Access patterns

| # | Pattern | How |
|---|---|---|
| A38 | A person's group inbox | GSI5, unchanged — `USER#<id>#accepted` |
| A39 | A person's group requests | GSI5, unchanged — `USER#<id>#requested` |
| A40 | Every participant of a conversation | Query `pk = CONV#<id>`, `sk` begins `PARTICIPANT#` |
| A41 | Is this person a participant, and in what state? | Point read `pk = USER#<userId>`, `sk = CONV#<conversationId>` |
| A42 | Membership history | The message stream carries join/leave events (FR-030) |

**A40 is new and needs a key.** Participation is currently stored only under the *person's*
partition (`USER#<id>` / `CONV#<id>`), which answers A41 but cannot list a conversation's
members without knowing them already — fine for a pair, where `participantIds` on the
conversation item is the answer, and not fine for a group whose membership changes.

```
conversationMember:  pk = CONV#<conversationId>   sk = PARTICIPANT#<userId>
```

This mirrors how media items share a post's partition so A3 is a single Query. **Two rows
per participation**, one under each partition, written in the same transaction as everything
else — the cost of A40 being a query rather than a scan.

## Blocking on add (FR-023)

No new item. The check reads the existing block relationships in both directions for the
person being added against every current participant, using the same `RelationshipCache`
the visibility boundary uses.

Bounded by the cap: at most 20 relationship lookups, cached per request.

**FR-023a is a contract on the response, not on storage.** The refusal must be
indistinguishable from any other "cannot add" refusal, which is why SC-012 compares literal
responses — a distinct error code, a distinct message, or a distinguishable latency all leak
the block just as well as saying so.

## Reporting

`subjectType` gains two values, matching the existing typed-subject reporting path:

| Value | `subjectId` | `remove_content` does |
|---|---|---|
| `review` | `<placeId>:<userId>` | sets `removedByModeration`, decrements the place aggregate (R6) |
| `conversation-name` | `<conversationId>` | blanks the name, leaves the conversation readable (R8) |

The compound `subjectId` for a review follows the shape 004 already uses for messages
(`<conversationId>:<messageId>`), so the moderation queue needs no new addressing scheme.

## Key builders to add

```
rating(placeId, userId)              pk = PLACE#<placeId>   sk = RATING#<userId>
ratingByPerson(userId, placeId)      pk = USER#<userId>     sk = RATED#<placeId>
ratingPrefix(placeId)                pk = PLACE#<placeId>   skPrefix = RATING#
conversationMember(convId, userId)   pk = CONV#<convId>     sk = PARTICIPANT#<userId>
conversationMemberPrefix(convId)     pk = CONV#<convId>     skPrefix = PARTICIPANT#
```

`SK_PREFIX` gains `rating: 'RATING#'` and `conversationMember: 'PARTICIPANT#'`.

**Note on the place partition.** `PLACE#<placeId>` now holds three sk shapes: `#META`,
`POST#<createdAt>#<postId>` and `RATING#<userId>`. That is the intended use of an overloaded
key and the reason `postPlaceIndexPrefix` already exists — but it does mean a place's
partition grows with both its posts and its ratings, and a query for one must not
accidentally scan the other. Both prefixes are explicit for that reason.
