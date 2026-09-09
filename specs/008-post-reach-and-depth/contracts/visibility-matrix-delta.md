# Contract: visibility matrix delta

**Feature**: 008 | Extends `specs/001-interest-media-sharing/contracts/visibility-matrix.md`
(and its 004/005 surface additions, currently 12 surfaces / 480 assertions).

**This is a contract.** SC-016 says every new read path appears here with **zero skipped
rows**, and FR-052 says every new read path passes the single boundary. A surface added to
the product without a row here is an incomplete change (Principle II).

## 1. A new viewer relationship

| Code | Meaning |
|---|---|
| `pending-follower` | Signed in; has **requested** to follow the author, not yet accepted (FR-043) |

A pending follower is a stranger for every purpose. It is enumerated separately because the
obvious implementation mistake is to treat the *existence* of a follow row as a follow, and a
row that exists in state `pending` is exactly that trap.

## 2. A new post-state axis: author account privacy

The decision table gains a dimension. `authorPrivacy = 'open'` reproduces the existing table
unchanged; `'private'` is the new half.

| Post state, author `private` | `anon` | `self` | `follower` | `pending-follower` | `stranger` | `blocked-by` | `blocker` |
|---|---|---|---|---|---|---|---|
| `public`, ready | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `followers`, ready | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `private`, ready | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| any, not ready / deleted / removed / author not active | ✗ | ✓ where the open table says ✓, else ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

**The whole of FR-044 is the first row**: a private author's `public` post is evaluated by
the `followers` rule. Every other row is unchanged, which is the evidence that this was one
clause and not a new predicate.

**FR-045** needs no row of its own: an existing follower is `follower` in both halves of the
table, so flipping privacy cannot remove their access.

## 3. New surfaces

| # | Surface | Endpoint | Story |
|---|---|---|---|
| 13 | Following feed | `GET /v1/feed/following` | US3 |
| 14 | Post search results | `GET /v1/search/posts?q=` | US6 |
| 15 | Comment replies | `GET /v1/posts/{postId}/comments` (replies included) | US7 |
| 16 | A collection's posts | `GET /v1/me/collections/{collectionId}/posts` | US15 |
| 17 | Saved list (already existed; re-asserted under the new privacy axis) | `GET /v1/me/saved` | US13 |

Surfaces 13–16 are new read paths and each MUST call `VisibilityFilter`. Surface 17 is not
new but its rows change, because a post saved before its author went private must stop being
readable — a case that only exists once US13 lands, and one a matrix organised by surface
alone would miss.

## 4. Surfaces that must NOT change, and are asserted so

These are the mute/dismissal cases (see `selection-vs-boundary.md`). They are listed **in
this contract** because the tempting implementation puts them in the boundary, and a matrix
that only enumerates what must be hidden cannot catch a rule that hides too much.

| Case | Required result |
|---|---|
| Muted author's post, on their profile | **visible** |
| Muted author's post, via `GET /v1/posts/{id}` | **visible** |
| Muted author's post, in feed / Following / search | absent (selection, not the boundary) |
| Dismissed post, via `GET /v1/posts/{id}` | **visible** |
| Dismissed post, in feed | absent |

## 5. Private-by-key surfaces

Drafts (US11), collections (US15), mutes and dismissals (US12) live in the owner's partition
with no index projecting them. They are asserted through **the path a modified client would
take** — a direct request with another person's id — not by the first-party client, per
Principle III. SC-015 is that assertion.

## 6. Test shape

The matrix is **generated from these tables**, not hand-written, exactly as 001 established.
Adding `authorPrivacy` roughly doubles the post-state axis and `pending-follower` adds a
seventh relationship; with 17 surfaces the generated count is in the low thousands of
assertions.

**A larger green number is not the goal and can be actively misleading.** 004 recorded that
462 assertions all running the same `decide()` would mean one function tested 66 times,
which is why `surface-routing.spec.ts` exists to prove each surface *consults* the filter.
The new surfaces MUST be added to that test too — a matrix row for a surface that never calls
the boundary passes for the wrong reason.

005 added `Surface.kind` for the same reason: without it, review surfaces would have run post
rows and reported a bigger green number for a smaller thing. New surfaces here declare their
kind for the same reason.
