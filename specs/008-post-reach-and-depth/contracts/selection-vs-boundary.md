# Contract: selection versus the boundary

**This is a contract, not documentation.** Under the constitution's workflow rules, the test
that enforces it MUST exist before the implementations it governs.

**Feature**: 008 | **Constitution**: 2.0.0, Principle II

## The rule

Principle II, second clause: *ranking selects candidates; the boundary decides.* This
feature adds three per-viewer rules that all look like "this person doesn't see that post",
and they do **not** all belong on the same side.

**The test that separates them, and the only one that may be used:**

> Does the rule change the answer to *may this viewer see this post* — on **every** surface,
> including the author's own profile?
>
> - **Yes** → it is a visibility rule and belongs in `VisibilityFilter`, as a candidate field
>   and a clause. It may not be implemented per surface.
> - **No** → it is a selection rule and belongs in candidate selection. It may not be
>   implemented in `VisibilityFilter`.

## The assignments

| Rule | Side | Why |
|---|---|---|
| **Mute** (FR-039, FR-040) | **Selection** | The follow survives, the conversation survives, and the muted person's profile stays readable. Mute means *do not select*, not *may not see*. |
| **Dismissal** (FR-041, FR-042) | **Selection** | Same, and it is additionally a ranking signal (FR-042), which only a selection stage can consume. |
| **Account privacy** (FR-043–FR-045) | **Boundary** | It changes *may this viewer see this post* on every surface at once, and 001/FR-017 + SC-009 require that flip to land everywhere immediately. |

## What each side must do — and must not

### Mute and dismissal — selection

MUST be applied in `CandidateSource` and in `FollowingFeedService`'s selection, and in any
future surface that selects candidates.

MUST NOT be imported by, referenced in, or reachable from `apps/api/src/visibility/`.

MUST NOT change what a direct read returns: `GET /v1/posts/:id` for a muted author's post,
and that author's profile listing, return their content unchanged. **A muted person's
profile is not empty.** This is the observable difference between the two sides and is the
behavioural half of the guard.

A mute MUST NOT be inferable by its subject from any count, ordering or aggregate (FR-040,
Principle III). Structurally: the mute row lives only in the muter's partition with no
inverted index, so no query the subject can write reaches it.

### Account privacy — the boundary

MUST be expressed as **one** new field on `VisibilityCandidate` (`authorPrivacy`) and **one**
clause in `decide()`: when the author is private, a `public` post is evaluated by the
`followers` rule.

MUST NOT appear as a check in any surface, service, repository or controller. If a surface
needs its own privacy check, the boundary is wrong — fix the boundary.

MUST take effect on every surface immediately, with no re-indexing and no cache invalidation
step. FR-045 (existing followers keep access) follows for free: the `followers` case reads
the person-follow, which a privacy flip does not touch.

Only an **accepted** follow satisfies the `followers` case. A pending follow request grants
nothing.

## The guards, and the order they are written in

Contract tests come first (constitution: *tests that define a contract are written first*).

| Guard | Kind | Asserts | Verified how |
|---|---|---|---|
| `tests/unit/selection-not-boundary.spec.ts` | Structural | `apps/api/src/visibility/**` does not import the mute or dismissal repositories, transitively | RED against a real import, before it is trusted |
| `tests/unit/privacy-is-not-per-surface.spec.ts` | Structural | No module outside `visibility/` reads `accountPrivacy` to decide what to return | RED against a hand-added surface check |
| `tests/integration/mute-does-not-hide-profile.spec.ts` | Behavioural | A muted author's posts: absent from feed and Following, **present** on their profile and on `GET /v1/posts/:id` | RED with mute wired into the filter |
| `tests/visibility/matrix.spec.ts` | Behavioural | Every enumerated surface, for a private author, against follower / non-follower / anonymous / operator | Zero skipped rows (SC-014, SC-016) |

**A guard that has not been watched to fail is not yet a guard.** 006's `safety-fit.spec.ts`
passed with the defect still in place, because it scrolled the document rather than the
app's own container. Each guard above names how it is verified red; that column is not
optional.

## Why a structural guard as well as a behavioural one

A behavioural test catches the violation once the code exists **and** a fixture exercises
it. A structural test fails when the *dependency* appears — before any post has been written
that would demonstrate the leak. 004 recorded this for
`feed-does-not-read-place-follows.spec.ts` and 007 widened that guard when the selection path
moved out of `feed.service.ts`. The same widening obligation applies here: if candidate
selection moves again, these guards move with it, or they are guarding a file the violation
no longer has to live in.
