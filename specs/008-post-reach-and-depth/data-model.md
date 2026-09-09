# Data Model: A complete app — reach, depth and control

**Feature**: 008 | **Date**: 2026-09-09

Extends the single-table design in `specs/001-interest-media-sharing/data-model.md` and its
004/005/007 additions. **No new table, no new GSI.** Access patterns continue from **A43**
(005 ended at A42; 007 added item types but no new patterns).

Two conventions from earlier features are load-bearing here and are restated because this
feature leans on both:

- **Private by key.** An item in the owner's own partition that no index projects cannot be
  reached by any query anyone else can write. `savedPost` (A32) established it; drafts,
  mutes, dismissals and collections all use it. This is stronger than a check every reader
  must remember.
- **A candidate index is not a visibility decision.** `postInterestIndex` and
  `postPlaceIndex` select rows; `VisibilityFilter` decides. The new term index (R6) is the
  same shape on purpose.

A note on `PERSON#`: `specs/001`'s data-model text mentions a `PERSON#` partition key that
has never existed in this codebase — the prefix is `USER#`. Everything below uses `USER#`,
which is what `keys.ts` writes.

---

## Phase A

### Notification read watermark (US2, FR-005–FR-007)

| Field | Type | Notes |
|---|---|---|
| `pk` | `USER#<userId>` | The owner's partition |
| `sk` | `#NOTIFREAD` | One item per person, like `#SIGNALPROFILE` |
| `lastReadAt` | ISO-8601 | The watermark |
| `updatedAt` | ISO-8601 | |

`readAt` on the notification response is **derived**, not stored:
`createdAt <= lastReadAt ? lastReadAt : null` (research R2). There is deliberately no stored
unread counter — the count is derived so it cannot disagree with the rows.

| # | Access pattern | How |
|---|---|---|
| A43 | Read the watermark | Point read `pk = USER#<id>`, `sk = #NOTIFREAD` |
| A44 | Unread count | Query notifications with `sk > NOTIF#<lastReadAt>`, bounded |

### Following feed (US3, FR-008–FR-010)

**No new item type.** Composed from existing patterns:

| # | Access pattern | How |
|---|---|---|
| A45 | Chronological posts by followed authors | A9 (`listFollowing`) then A5 (`postByAuthor`, GSI2) per author, merge-sorted by `createdAt` desc, then `VisibilityFilter` |

Bounded by `MAX_FOLLOWED_PEOPLE = 200` (research R3). The cursor is a timestamp; there is no
stored cursor state.

### Media set (US1)

**No storage change.** `keys.mediaItem` already sorts on `MEDIA#<ordinal>` zero-padded to
three digits, so publication order is structural. Access pattern A3 is unchanged.

---

## Phase B

### Avatar (US5, FR-017–FR-019)

`avatarKey` already exists on the person item (`person.repository.ts:9`) and
`updateProfile` already accepts it — it has simply never been written. No schema change;
what changes is that `PATCH /v1/me` sets it from the server's own upload record, and that
**one** projection presigns it (research R5).

### Post term index (US6, FR-020–FR-022)

| Field | Type | Notes |
|---|---|---|
| `pk` | `TERM#<token>` | One partition per distinct token, lowercased |
| `sk` | `POST#<createdAt>#<postId>` | Newest-first within a term, same shape as `postInterestIndex` |
| `authorId` | string | Projected so a candidate needs no extra read before filtering |
| `postId` | string | |

Written on publish; **capped at 40 distinct tokens per post**. Deleted with the post.

| # | Access pattern | How |
|---|---|---|
| A46 | Posts containing a term | Query `pk = TERM#<token>`, `sk` begins `POST#` |
| A47 | Posts containing every term in a query | A46 per term, intersect by `postId`, then `VisibilityFilter` |

**Honest limits** (R6): whitespace/punctuation tokenisation with case folding. No stemming,
no phrases, no relevance beyond recency. `TERM#the`-style common tokens produce large
partitions; a stop-word list is applied at write time and is a named constant so it can be
argued with.

---

## Phase C

### Comment parent, edit and moderation (US7, US8)

Added to the existing comment item (`pk = POST#<id>`, `sk = COMMENT#<createdAt>#<id>` —
**unchanged**, so listing comments stays one Query):

| Field | Type | Notes |
|---|---|---|
| `parentCommentId` | string, optional | Another comment **on the same post** (validated) |
| `editedAt` | ISO-8601, optional | FR-027's "marked as edited" *is* the presence of this field |
| `moderationState` | `'visible' \| 'removed'` | Same shape as `messageSchema`; removal does **not** cascade to replies (FR-026) |
| `deletedAt` | ISO-8601, optional | Soft delete; `commentCount` decremented in the same transaction |

| # | Access pattern | How |
|---|---|---|
| A48 | A post's comments with replies grouped | A15 unchanged; grouping by `parentCommentId` in the service |

### Mentions (US9)

| Field | Type | Notes |
|---|---|---|
| `mentions` | `string[]` of userIds | On the post and on the comment. **Resolved at write time** (R9), never re-parsed at read |

No index: a "posts mentioning me" surface is not a requirement, and adding the index before
the surface is how unused writes accumulate.

### Alt text (US10)

| Field | Type | Notes |
|---|---|---|
| `altText` | string, optional, ≤300 | On the **media item**, not the post — a post has up to ten |

### Draft (US11)

| Field | Type | Notes |
|---|---|---|
| `pk` | `USER#<userId>` | Private by key |
| `sk` | `DRAFT#<draftId>` | |
| `caption`, `interestIds`, `placeId` | | Restored on open |
| `uploadIds` | `string[]` | **Upload targets, not media rows** — a draft is a pre-publish object, so publishing uses the existing path unchanged (R11) |
| `updatedAt` | ISO-8601 | |

| # | Access pattern | How |
|---|---|---|
| A49 | My drafts, newest first | Query `pk = USER#<id>`, `sk` begins `DRAFT#` |

Deleted inside the publish transaction, so FR-038's "stops being a draft" cannot half-happen.

---

## Phase D

### Mute (US12, FR-039, FR-040)

| Field | Type | Notes |
|---|---|---|
| `pk` | `USER#<muterId>` | **No inverted index — this is the mechanism of FR-040.** The subject has no query that reaches it |
| `sk` | `MUTE#<mutedId>` | |
| `createdAt` | ISO-8601 | |

| # | Access pattern | How |
|---|---|---|
| A50 | Whom do I mute? | Query `pk = USER#<id>`, `sk` begins `MUTE#` — read once per request into the relationship cache |

Applied in **candidate selection**, never in `VisibilityFilter` (research R12).

### Dismissal (US12, FR-041, FR-042)

| Field | Type | Notes |
|---|---|---|
| `pk` | `USER#<viewerId>` | |
| `sk` | `DISMISS#<postId>` | |
| `createdAt` | ISO-8601 | Also emitted as a negative ranking signal |

| # | Access pattern | How |
|---|---|---|
| A51 | Have I dismissed this post? | Point read, or a bounded prefix Query folded into the request cache |

`dismiss` becomes a signal kind and therefore **must appear in 007's signals disclosure and
be cleared by its reset** — a collected signal absent from the disclosure is a Principle III
violation, not an oversight.

### Account privacy and follow requests (US13, FR-043–FR-045)

On the person item:

| Field | Type | Notes |
|---|---|---|
| `accountPrivacy` | `'open' \| 'private'` | Default `open`. Becomes `authorPrivacy` on `VisibilityCandidate` |

On the existing person-follow row (`USER#<followerId>` / `PFOLLOW#<followeeId>`):

| Field | Type | Notes |
|---|---|---|
| `state` | `'accepted' \| 'pending'` | Absent means `accepted` — every follow written before 008 keeps working, the same compatibility rule 005/FR-026 used for conversation state |

**State lives on the follow row, not on the person** — 005/R2's finding, applied: a shared
item cannot hold a state that differs per participant, and one pending follower must not be
able to change another's.

Only `accepted` follows satisfy the `followers` case in `VisibilityFilter`, which is what
makes FR-044 true on every surface with one clause (research R13).

| # | Access pattern | How |
|---|---|---|
| A52 | My pending follow requests | A11 (`personFollowInverted`, GSI4) filtered to `pending` |

### Appeal (US14, FR-046–FR-048)

| Field | Type | Notes |
|---|---|---|
| `pk` | `APPEAL#<appealId>` | |
| `sk` | `#META` | |
| `gsi1pk` | `ASTATE#<state>` | Mirrors `reportByState` so the queue is one Query and moves between queues with one write |
| `gsi1sk` | `TS#<createdAt>` | Oldest first |
| `subjectKind` | `'post' \| 'comment' \| 'message' \| 'review'` | |
| `subjectId`, `authorId`, `body`, `state`, `outcome` | | `state`: `open \| upheld \| rejected` |

The outcome is appended to the existing `MODLOG#<yyyymm>` log (Principle IV: append-only,
survives deletion of the subject).

| # | Access pattern | How |
|---|---|---|
| A53 | The appeal queue, oldest first | Query GSI1 `gsi1pk = ASTATE#open` |
| A54 | My appeals | Query `pk = USER#<id>`, `sk` begins `APPEALBY#` (a pointer row, so the author's list needs no scan) |

---

## Phase E

### Collection (US15, FR-049–FR-051)

| Field | Type | Notes |
|---|---|---|
| `pk` | `USER#<ownerId>` | Private by key |
| `sk` | `COLLECTION#<collectionId>` | |
| `name` | string ≤60 | **User-generated content**: reportable and moderatable (Principle IV) |
| `itemCount`, `createdAt` | | |

| Field | Type | Notes |
|---|---|---|
| `pk` | `USER#<ownerId>` | |
| `sk` | `COLLITEM#<collectionId>#<savedAt>#<postId>` | A post MAY be in more than one collection (FR-049) |

| # | Access pattern | How |
|---|---|---|
| A55 | My collections | Query `pk = USER#<id>`, `sk` begins `COLLECTION#` |
| A56 | Posts in a collection, newest first | Query `sk` begins `COLLITEM#<collectionId>#` |

**Adding to a collection writes the membership row and the `savedPost` rows (A32/A33) in one
`TransactWriteItems`**, so FR-051 cannot be violated by any path — a collection add is
additive, never a move (research R15).

---

## Item-count budget for `TransactWriteItems`

005/R3 recorded that the transaction cap is 100 items and that this is a **correctness**
constraint, not a preference. The new transactions here are small and stated so the next
person does not have to rediscover the ceiling:

| Transaction | Items |
|---|---|
| Publish a post with N media and T terms | 1 post + N media + interests + place + **T ≤ 40 terms** + draft delete |
| Delete a comment | comment + post counter = 2 |
| Add to a collection | membership + `savedPost` + `savedPostBy` + counter = 4 |

**Publish is the one to watch.** `PostTransaction` documents its own bound today — at most
10 media, 2 index items per assigned interest, one place item, "well inside DynamoDB's
100-item transaction limit". Adding up to 40 term rows takes a worst case of roughly 60 and
narrows that margin from comfortable to merely sufficient. The term cap is therefore **not a
free tuning knob**: raising it, or raising the media limit, must be re-checked against the
100-item ceiling, which 005/R3 established is a correctness constraint rather than a
preference.
