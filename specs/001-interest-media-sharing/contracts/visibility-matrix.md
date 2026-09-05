# Contract: Post Visibility Matrix

**Feature**: `specs/001-interest-media-sharing`
**Serves**: FR-014, FR-015, FR-016, FR-018, FR-042, FR-044 — verified by **SC-009**

This is a contract, not documentation. Research §D6 puts every post read behind one
`VisibilityFilter` boundary; this table is the specification of that boundary and is
implemented directly as a table-driven test. SC-009 ("no post is ever shown to a viewer
its visibility setting excludes, verified across every surface") passes when this
matrix passes on every surface listed below.

## Viewer relationships

| Code | Meaning |
|---|---|
| `anon` | Not signed in |
| `self` | The post's author |
| `follower` | Signed in, follows the author (Person Follow exists) |
| `stranger` | Signed in, does not follow the author |
| `blocked-by` | Signed in; the author has blocked them |
| `blocker` | Signed in; they have blocked the author |

## Decision table

`✓` = the post is returned. `✗` = the post is absent or refused.

| Post state | `anon` | `self` | `follower` | `stranger` | `blocked-by` | `blocker` |
|---|---|---|---|---|---|---|
| `public`, ready | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `followers`, ready | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `private`, ready | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| any, `processingState` ≠ ready | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| any, soft-deleted | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| any, author `status` ≠ active | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| any, removed by moderation | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

**Rules the table encodes**

1. A block hides content in **both** directions (FR-044) and overrides everything else,
   including `public`. This is why `blocker` is a distinct column from `blocked-by` —
   both must be `✗`, and testing only one direction is the easy mistake.
2. `followers` resolves against the **Person Follow** item (FR-015). Following the
   post's *interest* grants nothing. This is the second easy mistake, given that
   interest-following is the dominant relationship in this product.
3. The author always sees their own post, including while it is still processing —
   except once it is deleted or removed by moderation.
4. A non-`active` author (deleting or deleted) has, for this purpose, no followers, so
   their followers-only content becomes inaccessible immediately on FR-003 deletion,
   before the async purge completes.

## Surfaces the matrix must hold on

FR-018 enumerates these. Each is a separate axis in the test, because each is a
different code path that could construct its own predicate:

| Surface | Endpoint |
|---|---|
| Interest space | `GET /interests/{interestId}/posts` |
| Home feed | `GET /feed/home` |
| Profile | `GET /people/{handle}/posts` |
| Interest search results | `GET /interests?q=` (post counts must not leak restricted posts) |
| Share link resolution | `GET /posts/{postId}` |
| Notifications | `GET /notifications` (a notification must not reveal an unopenable post) |
| Comments | `GET /posts/{postId}/comments` (readable exactly when the post is) |

**Test shape**: 7 post states × 6 viewer relationships × 7 surfaces = 294 assertions,
generated from this table rather than written by hand. A new surface added later adds
one row to the surface list, not a new set of hand-written cases.

## Error distinction (FR-042)

Share links must tell "gone" apart from "not for you", because the spec's acceptance
scenarios ask for different messages:

| Situation | Status | Client message |
|---|---|---|
| Post deleted, or never existed | `404` | "No longer available" |
| Post exists, viewer excluded by visibility | `403` | "Not available to you" |
| Post exists, viewer blocked | `404` | "No longer available" — deliberately indistinguishable from deletion, so a block is not disclosed |

The block case returning `404` rather than `403` is intentional: a `403` would confirm
to a blocked person that the post exists, which discloses the block.
