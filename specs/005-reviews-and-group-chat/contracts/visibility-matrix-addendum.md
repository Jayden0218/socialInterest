# Visibility matrix addendum — feature 005

**This is a contract, not documentation.** It is enforced by
`apps/api/tests/visibility/matrix.spec.ts` and `surface-routing.spec.ts`, and per the
constitution's workflow section its test is written **before** the implementations it
governs (plan gate G4).

Extends `specs/001-interest-media-sharing/contracts/visibility-matrix.md` and 004's
addendum, which together close SC-005 at 462 assertions across 11 surfaces with zero
skipped.

---

## 1. A twelfth surface

| # | Surface | Returns | Added by |
|---|---|---|---|
| 12 | **place reviews** | reviews | 005/US2 |

The surface list in `apps/api/tests/visibility/surfaces.ts` gains this row, and the ratchet
added in 004/T128 applies to it: the suite fails if any enumerated surface is not built, so
this row cannot be added ahead of the work and forgotten.

**The place page is already surface 8 and returns posts.** It now returns two kinds of
content through two entry points, and both must be probed. A surface-routing probe that only
covered the post path would report the place page as consulting the boundary while its
review path did not.

---

## 2. The review decision table

A review has **no audience setting** (research R4). The rules that apply are a strict subset
of the post rules, and the table is correspondingly smaller: 4 states × 4 viewers.

### States

| State | Meaning |
|---|---|
| `live` | ordinary review |
| `removed` | removed by a moderator (FR-015) |
| `author-deleting` | the author's account is being deleted |
| `author-deleted` | the author's account is gone |

### Viewers

| Viewer | |
|---|---|
| `anonymous` | signed out |
| `author` | the person who wrote it |
| `other` | any other signed-in person |
| `operator` | a moderator |

### Table

| State ↓ / Viewer → | anonymous | author | other | operator |
|---|---|---|---|---|
| `live` | visible | visible | visible | visible |
| `removed` | gone | **gone** | gone | gone |
| `author-deleting` | gone | gone | gone | gone |
| `author-deleted` | gone | gone | gone | gone |

**Two rows deserve their reasons stated, because both are places a reasonable person would
implement the opposite.**

- **`removed` is gone to its own author.** Posts behave the same way
  (`removedByModeration` → `gone` for everyone including the author), and the consistency is
  the point: a moderated review that its author can still see reads as "the removal didn't
  work" and invites a second submission. The author learns of the removal through the
  notification FR-015's path already sends, not by finding it still on the page.
- **`removed` is gone to an operator too.** A moderator reviewing a decision reads the
  append-only log, which survives the content (FR-015). Making removed content visible to
  operators on the product surface would be a second, weaker moderation view.

### Blocking

Applied on top of the table, in **both directions**, exactly as for posts:

| Relationship | Result |
|---|---|
| viewer has blocked the author | `gone` |
| the author has blocked the viewer | `gone` |

FR-013 and SC-004. Both directions are asserted separately — a single-direction check passes
against an implementation that only looks one way, which is the defect the two-direction
assertion exists to catch.

**Severance is computed, not stored** (004/FR-006). Unblocking restores the review, because
nothing was destroyed.

---

## 3. Assertion count

| Component | Count |
|---|---|
| Review states × viewers | 4 × 4 = 16 |
| Blocking, both directions, on a `live` review | 2 |
| **Subtotal, new** | **18** |
| Existing (001 + 004) | 462 |
| **Total** | **480** |

`matrix.spec.ts` asserts the total, so a surface that stops being covered fails loudly
rather than reporting a smaller green number — the ratchet 004/T128 added, applied to this
addendum.

---

## 4. Routing: what `surface-routing.spec.ts` must prove

The matrix alone cannot establish Principle II. Every row runs the same decision function,
so 480 assertions would otherwise mean one function tested 240 times while a surface quietly
held its own predicate.

For this addendum, the routing probes must show:

1. The place page's **review** path calls the visibility module, distinctly from its post
   path.
2. The review path uses the **same block resolution** as the post path — not a second
   implementation that agrees today. This is asserted structurally: `authored-content.ts`
   must not import `BlockRepository` directly, because the shared function is where the
   block question is answered once.

Point 2 is the whole of research R4. Two entry points that each read blocks independently
are exactly the two predicates Principle II forbids, and they would pass every assertion in
section 2 while being one refactor away from disagreeing.

---

## 5. Not covered here, and stated so

- **Ratings are not visibility-controlled.** A rating with no review text contributes to a
  place's average and is not itself readable content; there is nothing to hide. A rating
  *with* text is a review and is covered above.
- **The aggregate is not filtered per viewer.** A place's average is the same number for
  everybody, including for a viewer who has blocked a reviewer. Filtering the average per
  viewer would make it a different number for every person, which is not an average, and
  would require reading every rating on every place-page view — the unbounded query research
  R5 exists to avoid.

  **This is a deliberate, stated leak of a kind**: a determined viewer who blocked somebody
  could in principle detect their rating's effect on an average by arithmetic. That is
  accepted, and it is recorded here rather than discovered later.
- **Group conversation membership is not a visibility-matrix surface.** Who may read a
  conversation is decided by `ConversationAccess`, which has its own table (004's addendum,
  6 states × 4 viewers × 2 operations) and is extended by 005 rather than folded in here.
  The two boundaries stay separate because one decides about content and the other about
  membership, and merging them would give the visibility filter a reason to know about
  conversations.
