# Phase 1 Data Model: Interest-Centred Media Sharing

**Feature**: `specs/001-interest-media-sharing` | **Date**: 2026-09-05
**Storage**: Amazon DynamoDB, single table `sih-main`, on-demand capacity

Derived from the Key Entities and Functional Requirements in
[`spec.md`](./spec.md); design rationale in [`research.md`](./research.md) §D3.

---

## Access patterns

Every pattern below comes from a numbered requirement. The key design exists to serve
this list and nothing else.

| # | Pattern | Requirement | Served by |
|---|---|---|---|
| A1 | Get a person by id | FR-002 | Main table, point read |
| A2 | Get a person by handle | FR-038 | GSI1 |
| A3 | Get a post with its media items | FR-004, FR-005 | Main table, one Query on the post partition |
| A4 | List recent posts in an interest | FR-025 | Main table, Query on interest partition |
| A5 | List recent posts by an author | FR-038 | GSI2 |
| A6 | List the interests a person follows | FR-027 | Main table, Query |
| A7 | Is this person following this interest? | FR-032 | Main table, point read |
| A8 | List followers of an interest | FR-029 suggestions, counts | GSI4 |
| A9 | List the people a person follows | FR-037 | Main table, Query |
| A10 | Is A following B? | **FR-015 visibility**, FR-034 | Main table, point read |
| A11 | List followers of a person | FR-038 counts | GSI4 |
| A12 | Get an interest by id, or by slug | FR-025, FR-026 | Main table / GSI1 |
| A13 | List sub-interests of a top-level interest | FR-020, FR-025 | GSI3 |
| A14 | Load the whole interest catalogue | FR-023, FR-026 cache | GSI3 scan-by-parent, or full-catalogue Query |
| A15 | List comments on a post | FR-040 | Main table, Query on post partition |
| A16 | Has this person reacted to this post? | FR-039 | Main table, point read |
| A17 | Reaction count for a post | FR-039 | Counter attribute on the post item |
| A18 | Is there a block between A and B? | FR-044 | Main table, point read |
| A19 | List open reports, oldest first | FR-045, SC-010 | GSI1 |
| A20 | List a person's notifications | FR-048 | Main table, Query |

Patterns A7, A10, and A18 are point reads because they sit on the visibility hot path
(research §D6) and are evaluated on every feed page.

---

## Key schema

Single table, overloaded keys.

| Attribute | Role |
|---|---|
| `pk` | Partition key |
| `sk` | Sort key |
| `gsi1pk` / `gsi1sk` | GSI1 — **Lookup**: handles, slugs, moderation queue |
| `gsi2pk` / `gsi2sk` | GSI2 — **ByAuthor**: a person's posts |
| `gsi3pk` / `gsi3sk` | GSI3 — **Hierarchy**: sub-interests under a parent |
| `gsi4pk` / `gsi4sk` | GSI4 — **Inverted**: reverse direction of both follow types |
| `type` | Item discriminator |
| `ttl` | Expiry, on notifications and soft-deleted items only |

All four GSIs project `KEYS_ONLY` plus the attributes named per entity below, so that
list reads do not require a follow-up fetch.

---

## Entities

### Person

```
pk  = USER#<userId>
sk  = #PROFILE
gsi1pk = HANDLE#<handleLower>   gsi1sk = #PROFILE
```

| Field | Type | Rules |
|---|---|---|
| `userId` | ULID | Immutable |
| `handle` | string | Unique (GSI1), 3-30 chars, `[a-z0-9_]`, case-insensitive |
| `displayName` | string | 1-50 chars — FR-002 |
| `avatarKey` | string? | S3 key of the processed avatar |
| `bio` | string? | ≤ 300 chars — FR-002 |
| `followerCount`, `followingCount`, `interestFollowCount` | number | Atomic counters — FR-038 |
| `notificationPrefs` | map | One boolean per category — FR-049 |
| `status` | enum | `active` \| `deleting` \| `deleted` — FR-003 |
| `createdAt` | ISO-8601 | |

**FR-003**: deletion sets `status=deleting` and enqueues a job that removes posts and
anonymises comments. Followers-only content becomes inaccessible as soon as the status
changes, before the job completes — the visibility filter treats a non-`active` author
as having no followers.

---

### Post

```
pk  = POST#<postId>
sk  = #META
gsi2pk = USER#<authorId>   gsi2sk = TS#<createdAt>#<postId>
```

| Field | Type | Rules |
|---|---|---|
| `postId` | ULID | Sortable by creation time |
| `authorId` | ULID | |
| `caption` | string? | ≤ 2 000 chars — FR-007 |
| `interestIds` | string list | ≥ 1 — **FR-006**; expanded on write per FR-024 |
| `visibility` | enum | `public` \| `followers` \| `private`, default `public` — **FR-013** |
| `processingState` | enum | `pending` \| `processing` \| `ready` \| `failed` — FR-009 |
| `mediaKind` | enum | `images` \| `video` |
| `reactionCount`, `commentCount` | number | Atomic counters |
| `createdAt`, `updatedAt` | ISO-8601 | |
| `deletedAt` | ISO-8601? | Soft delete; `ttl` set for purge — FR-012 |

**Invariant**: a post with `mediaKind=video` has exactly one Media Item; a post with
`mediaKind=images` has one to ten.

**Invariant**: a post is only visible to anyone other than its author once
`processingState=ready`.

---

### Media Item

```
pk  = POST#<postId>
sk  = MEDIA#<ordinal>       (ordinal zero-padded, 000-009)
```

Sharing the post's partition means A3 fetches the post and all its media in one Query.

| Field | Type | Rules |
|---|---|---|
| `kind` | enum | `image` \| `video` |
| `originalKey` | string | S3 key of the upload; cleared once derivation succeeds |
| `renditions` | map | Variant name → S3 key. Video: HLS master + poster frame |
| `width`, `height` | number | |
| `durationMs` | number? | Video only; validated against the duration cap — FR-005 |
| `exifStripped` | boolean | **FR-010** — set true only by the server-side processor |
| `processingState` | enum | Per-item; the post's state is the aggregate |

**FR-010 is enforced here and only here.** `exifStripped` is written by the image
processing Lambda. A media item with `exifStripped=false` never becomes `ready`, so an
unprocessed original cannot reach a reader.

---

### Post–Interest index item

```
pk  = INTEREST#<interestId>
sk  = POST#<createdAt>#<postId>
```

The item that makes A4 a single Query. **One is written per interest in the post's
expanded set** — its sub-interest *and* that sub-interest's parent, which is how FR-024
roll-up is served without a second query.

| Field | Type | Why it is duplicated here |
|---|---|---|
| `postId`, `authorId` | ULID | Feed ranking needs the author without fetching the post — FR-034 |
| `visibility` | enum | **The visibility filter runs on Query results directly**, avoiding a fetch per candidate on every feed page |
| `processingState` | enum | Excludes not-yet-ready posts from interest spaces |

**Consistency rule**: `visibility` and `processingState` are denormalised, so FR-017
(a visibility change applies immediately everywhere) updates the post item *and* its
index items in a single `TransactWriteItems`. The set is bounded — at most two index
items per assigned interest — so the transaction stays within DynamoDB's limits.
Re-filing a post (FR-011) deletes the old index items and writes new ones in the same
transaction.

---

### Interest

```
pk  = INTEREST#<interestId>
sk  = #META
gsi1pk = ISLUG#<slug>        gsi1sk = #META
gsi3pk = PARENT#<parentId>   gsi3sk = NAME#<nameLower>      (sub-interests)
gsi3pk = PARENT#ROOT         gsi3sk = NAME#<nameLower>      (top-level interests)
```

| Field | Type | Rules |
|---|---|---|
| `interestId` | ULID | |
| `name` | string | 2-50 chars; unique per parent, case-insensitively — FR-023 |
| `nameNormalised` | string | Lowercased, punctuation and whitespace collapsed; the key used for duplicate detection |
| `slug` | string | Globally unique, URL-safe |
| `level` | enum | `top` \| `sub` — **FR-020**, exactly two levels |
| `parentId` | ULID? | Required when `level=sub`, absent when `level=top` |
| `createdBy` | ULID \| `SYSTEM` | Operator for top-level, a person for sub — FR-021, FR-022 |
| `description` | string? | ≤ 500 chars |
| `postCount`, `followerCount` | number | Atomic counters |
| `state` | enum | `active` \| `merging` \| `merged` \| `retired` — FR-030 |
| `mergedIntoId` | ULID? | Set when `state=merged`; reads follow the redirect |

**Invariant (FR-020)**: `level=top` ⟹ `parentId` absent. `level=sub` ⟹ `parentId`
references an interest with `level=top`. Nesting beyond two levels is rejected at write
time, matching the spec's Assumption.

**Invariant (FR-021/FR-022)**: only an operator may create `level=top`. Any signed-in
person may create `level=sub`, under exactly one parent.

**FR-030 (merge / re-parent)**: an asynchronous job, because the item count is
unbounded. Transitions `active → merging`, rewrites post index items and follow items
in idempotent batches, then `merging → merged` with `mergedIntoId` set. While
`merging`, reads resolve through the redirect and writes to the source are rejected.
Retiring a top-level interest with live sub-interests is refused unless they are
re-parented first — the spec's edge case requiring that posts are never orphaned.

---

### Interest Follow

```
pk  = USER#<userId>          sk = IFOLLOW#<interestId>
gsi4pk = INTEREST#<interestId>   gsi4sk = IFOLLOWER#<userId>
```

Forward direction serves A6 and A7; the inverted GSI serves A8. `followedAt` recorded.

**FR-028**: a follow of a top-level interest covers its sub-interests. This is resolved
at read time by expanding the followed set against the cached catalogue, *not* by
writing a follow row per sub-interest — otherwise a new sub-interest would need
back-filling into every parent-follower's row set.

**Cap**: 200 followed interests per person, per research §D1.

---

### Person Follow

```
pk  = USER#<followerId>      sk = PFOLLOW#<followeeId>
gsi4pk = USER#<followeeId>   gsi4sk = PFOLLOWER#<followerId>
```

| Field | Type | Notes |
|---|---|---|
| `followedAt` | ISO-8601 | |

One-directional, per the spec's Assumptions — no request-to-follow state.

**This item is the authority for FR-015.** "Can this viewer see a followers-only post?"
is the point read A10 on `USER#<viewerId>` / `PFOLLOW#<authorId>`. Because it is a
point read on the partition key, it stays cheap on the feed hot path and is cached per
request.

---

### Reaction

```
pk  = POST#<postId>          sk = REACTION#<userId>
```

The key **structurally enforces** the spec's "at most one per person per post" — a
second reaction is the same item. `reactionCount` on the post is maintained with an
atomic `ADD` guarded by an `attribute_not_exists` condition on the reaction item, so a
double-tap cannot double-count.

**Known hotspot**: all reactions on one post share a partition. Acceptable at the scale
SC-011 states. If a post goes viral, shard the count across `REACTION#<userId>` writes
plus N counter items and sum on read — a contained change, deliberately not built now.

---

### Comment

```
pk  = POST#<postId>          sk = COMMENT#<createdAt>#<commentId>
```

| Field | Type | Rules |
|---|---|---|
| `commentId` | ULID | |
| `authorId` | ULID | FR-040 attribution |
| `body` | string | 1-1 000 chars |
| `createdAt` | ISO-8601 | Sort order |
| `deletedAt`, `anonymisedAt` | ISO-8601? | FR-003 account deletion |

A comment is readable exactly when its post is — the visibility filter is applied to the
post, never separately to the comment.

---

### Block

```
pk  = USER#<blockerId>       sk = BLOCK#<blockedId>
gsi4pk = USER#<blockedId>    gsi4sk = BLOCKEDBY#<blockerId>
```

**FR-044**: creating a block also deletes any Person Follow in either direction, in one
transaction. The visibility filter consults blocks in both directions (A18), which is
how the spec's edge case — previously visible followers-only content is withdrawn —
falls out automatically rather than needing its own code path.

---

### Report

```
pk  = REPORT#<reportId>      sk = #META
gsi1pk = RSTATE#<state>      gsi1sk = TS#<createdAt>
```

| Field | Type | Rules |
|---|---|---|
| `subjectType` | enum | `post` \| `comment` \| `interest` — **FR-043** covers all three |
| `subjectId` | ULID | |
| `reporterId` | ULID | |
| `reason` | enum | Fixed taxonomy |
| `state` | enum | `open` \| `under_review` \| `actioned` \| `dismissed` |
| `outcome`, `moderatorId`, `resolvedAt` | | FR-045 |

GSI1 ordered by `createdAt` gives the moderation queue oldest-first, which is what
SC-010 (24h decision for 95%) needs to be measurable.

---

### Moderation Action (audit)

```
pk  = MODLOG#<yyyy-mm>       sk = TS#<timestamp>#<actionId>
```

Append-only, partitioned by month. **FR-047** requires decisions be auditable later;
a separate immutable log is what makes that true even after the subject item is deleted.

---

### Notification

```
pk  = USER#<recipientId>     sk = NOTIF#<createdAt>#<notificationId>
ttl = createdAt + 90 days
```

`kind` ∈ `reaction` \| `comment` \| `follow` — FR-048. Generation checks
`notificationPrefs` (FR-049) **and** the visibility filter, so a notification is never
the channel through which restricted content leaks (FR-018).

---

## State transitions

**Post processing** — FR-009

```
pending ──upload complete──> processing ──derivation ok──> ready
                                  │
                                  └──derivation failed──> failed ──retry──> processing
```
Only `ready` posts appear to anyone but the author.

**Post visibility** — FR-013, FR-017. Any transition among `public`, `followers`,
`private` is permitted at any time, applied transactionally across the post item and
its index items. `public → private` invalidates outstanding share links by construction
(FR-042 resolves against current visibility), which is the spec's edge case.

**Interest lifecycle** — FR-030

```
active ──merge requested──> merging ──job complete──> merged (mergedIntoId set)
   │
   └──retire (no live children)──> retired
```

**Report lifecycle** — FR-045

```
open ──> under_review ──> actioned | dismissed
```

---

## Validation rules by requirement

| Rule | Requirement | Enforced |
|---|---|---|
| Post must have ≥ 1 interest | FR-006 | Write-time, before any item is created |
| Sub-interest name unique per parent (normalised) | FR-023 | Conditional write on GSI3 key + catalogue pre-check |
| Interest hierarchy is exactly two levels | FR-020 | Write-time: `parentId` must resolve to `level=top` |
| Only operators create top-level interests | FR-021 | Authorisation at the API boundary |
| Video within size and duration caps | FR-005 | Checked before the presigned URL is issued, and again after derivation |
| EXIF stripped before readable | FR-010 | `exifStripped` gates `processingState=ready` |
| One reaction per person per post | FR-039 | Key structure |
| Follow cap of 200 interests | research §D1 | Conditional write against `interestFollowCount` |
| Rate limits on publish, comment, sub-interest creation | FR-046 | Token bucket per person, checked at the API boundary |

---

## Notes on what is deliberately *not* modelled

- **No materialised per-user timeline.** Research §D1: it would conflict with FR-017
  and FR-018.
- **No follow row per sub-interest** when a parent is followed. Expanded at read time
  against the cached catalogue instead, so that new sub-interests are covered
  immediately without back-fill.
- **No aggregate/analytics items.** SC-007 and SC-008 are answered from the S3 +
  Athena pipeline, never from the operational table.
