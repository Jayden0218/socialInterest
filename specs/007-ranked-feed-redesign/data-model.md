# Data Model — 007

Two new item types on the existing `sih-main` table, one new attribute on nothing, and
**no new GSI**. Everything else this feature touches is presentation.

## New item types

### Signal profile — the running total

| | |
|---|---|
| `pk` | `USER#<userId>` |
| `sk` | `#SIGNALPROFILE` |
| `weights` | Map of `interestId` → `{ w: number, at: ISO-8601 }` |
| `updatedAt` | ISO-8601 |

One item per person. Read once per feed request, updated in place on ingest. `w` is the
accumulated weight and `at` is when it last moved; **decay is applied on read** from `at`,
never by rewriting the row (research R3).

The update is a **read-modify-write, not an atomic `ADD`** — this said "atomic add" until
T078 checked it against `SignalRepository.addWeight`, and the difference is a concurrency
guarantee the row does not have. DynamoDB cannot increment a nested map entry whose path
does not yet exist, and each weight carries its own `at`, so the value is a map entry
rather than a number. What that loses is a fraction of one weight when two signals for the
SAME person race; they arrive from one device at human speed, and a lost fraction of a
ranking weight is not a correctness defect worth a transaction. Recorded because a reader
who believed "atomic" would size the risk wrongly.

Bounded by construction: the map is keyed by interest, and the catalogue is small and
slow-changing. A profile cannot grow without bound the way a per-post history would.

### Signal event — what actually happened

| | |
|---|---|
| `pk` | `USER#<userId>` |
| `sk` | `SIGNAL#<timestamp>#<postId>` |
| `kind` | `open` \| `dwell` \| `like` \| `save` |
| `interestId` | The post's interest at the time of the signal |
| `dwellMs` | Present for `dwell` only, server-clamped to 30000 |
| `ttl` | 30 days from creation |

Written on ingest, expired by TTL. Exists so that clearing signals can be verified as
actually clearing something (FR-012), and so a folding bug can be diagnosed against events
rather than against a total. Never read on the feed path.

### Seed interests — a starting point, not a subscription

| | |
|---|---|
| `pk` | `USER#<userId>` |
| `sk` | `#SEEDINTERESTS` |
| `interestIds` | List, at most 20 |
| `chosenAt` | ISO-8601 |

**Deliberately not an interest follow.** Storing seeds as follows would recreate the
subscription feed this feature removes, because every later reader treats a follow as a
follow. A distinct item type makes "these are a seed" structural rather than a convention
someone has to remember (research R4, FR-014).

## Access patterns added

| # | Pattern | Requirement | Index |
|---|---|---|---|
| B1 | Read a person's signal profile | FR-002 | Main table, `GetItem` |
| B2 | Add weight to one interest in a profile | FR-003 | Main table, `UpdateItem` ADD |
| B3 | Append a signal event | FR-003 | Main table, `PutItem` |
| B4 | List a person's signal events (for deletion) | FR-012 | Main table, `Query` by `SIGNAL#` prefix |
| B5 | Delete profile and all events | FR-012 | Main table, `Query` + `BatchWrite` |
| B6 | Read seed interests | FR-014, FR-015 | Main table, `GetItem` |
| B7 | Candidate posts for a set of interests | FR-002 | **Existing** post-interest index |

B7 is the point: the candidate source is the index that already exists. This feature adds
no read path over posts, which is why Principle II's surface enumeration does not grow.

## Derived, not stored

- **The decayed weight.** `w × 0.5^(age_days / 14)`, computed at read time.
- **The ranked order.** Produced per request. Never persisted, never shared between
  viewers, never served from cache — Principle II forbids serving a set assembled before
  the viewer was known.
- **The explanation shown in Settings.** Rendered from the top decayed weights at read
  time, so it cannot drift from the ranking it describes.

## What does not change

`Post`, `Interest`, `Person`, `Place`, `Conversation`, `Report`, and every existing
access pattern. The visibility boundary reads exactly what it read before, because ranking
hands it a candidate list and nothing else.
