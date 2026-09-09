# Research: A complete app — reach, depth and control

**Feature**: 008 | **Date**: 2026-09-09 | **Constitution**: 2.0.0

Sixteen decisions. Each was taken against the source, and where reading the source changed
what the story is, that is said rather than smoothed over.

---

## R1 — The media set: the server was never the problem

**Decision**: US1 is a **mobile-only** change. Add a `MediaPager` on the detail surface, a
count indicator on browse surfaces, and an author-only slot for a failed item. Change no
API code.

**Rationale**: `PostQueryService.toResponse` already maps **every** media row through
`toMediaItem`, presigning each rendition, and `keys.mediaItem` sorts on
`MEDIA#000`-style zero-padded ordinals — so FR-001's "publication order" is already
structural and needs no `order` field. The loss is entirely at four client call sites:
`PostCard.tsx:67`, `PostCard.tsx:264`, `Waterfall.tsx:38`, `PostDetailScreen.tsx:43`, each
reading `post.media?.[0]`.

FR-003 (a browse surface indicates more than one item **without becoming navigable per
item**) is the interesting half. A swipeable card inside a vertically-scrolling waterfall
fights the parent scroll for the same gesture, and 007/R6 already recorded that nesting
scrollables in this feed disables windowing. So the browse surface gets a **static
indicator**, not a pager, and the requirement says so on purpose.

**Alternatives rejected**: adding an `order` field (the sort key already carries it — a
second source of truth for the same fact); a carousel on the card (gesture conflict, and
FR-003 forbids it).

**Guard**: the mobile tests that cover post rendering currently use single-item fixtures.
A multi-item fixture is added to each, which is what makes the defect impossible to
reintroduce silently.

---

## R2 — Notification read state: a watermark, and a **derived** `readAt`

**Decision**: one item per person, `USER#<id> / #NOTIFREAD`, holding `lastReadAt`. A new
`PUT /v1/notifications/read` writes it. (Planned as `/v1/me/notifications/read`; moved during
implementation to sit beside `PUT /v1/conversations/:id/read`, the read watermark this
feature is copying. Two watermark routes shaped differently would be one more thing to
remember.) `readAt` stays in the response contract and is
**derived** at projection time: `createdAt <= lastReadAt ? lastReadAt : null`. The unread
count is derived by querying notifications newer than the watermark, bounded.

**Rationale**: this codebase already has this exact pattern — `ConversationRepository.markRead`
writes `lastReadAt` on the participant row, driven by `PUT /v1/conversations/:id/read`. Using
it again is one pattern with two applications rather than a second invention, and it makes
FR-007 ("mark all read") the same single write rather than a second mechanism.

Writing `readAt` onto each row during `GET /v1/notifications` was rejected for two reasons,
and the second is the stronger: it makes a read mutate N rows on a hot path, and it makes a
**GET have side effects**, which breaks retry and caching semantics for any client.

**Deliberately NOT copied from conversations**: the participant row's `unreadCount` counter.
A stored count and the rows it counts are two sources of truth for one fact, and 005/R5
already made this argument for the rating aggregate — where the counters were kept
transactional precisely because they could otherwise disagree. Here nothing needs a counter
to be cheap, so the count is derived and cannot disagree.

**Alternatives rejected**: per-item write on read (above); a separate unread counter
(above); `readAt` as a stored per-item field written by an explicit "mark this one read"
(no requirement asks for per-item read state, and FR-006's "true number" is easier to keep
true with one watermark than with N flags).

---

## R3 — The Following feed: read-time fan-out, bounded by a new follow cap

**Decision**: `FollowingFeedService` reads the viewer's follows (A9), queries each followed
author's posts via GSI2 (A5, `postByAuthor`, already exists), merge-sorts by `createdAt`
descending, then passes the merged candidate set through `VisibilityFilter`. The cursor is a
timestamp, so resumption is a bound on each per-author query rather than stored state.

**A person-follow cap of 200 is introduced** (`MAX_FOLLOWED_PEOPLE`), mirroring
`MAX_FOLLOWED_INTERESTS = 200` and the same 2s p95 budget that number was chosen against.

**Rationale**: the fan-out is one query per followed author. Without a cap the feed has no
stated worst case, and "unbounded but probably fine" is exactly the claim this project's
records exist to stop. The cap is a **product constraint arriving from a technical bound**,
so it is written down here and in the plan rather than absorbed into an implementation.

FR-009 (no ranking signals) is enforced **structurally**, not by review:
`following-feed.service.ts` must not import `SignalService`, `RankingService` or
`CandidateSource`. This is the same guard shape as
`feed-does-not-read-place-follows.spec.ts` and `ranking-cannot-admit.spec.ts`, and it must
be verified RED against a real import before it is trusted — a guard nobody has watched
fail is not yet a guard (006's `safety-fit.spec.ts` passed with the defect in place).

SC-005 also asks for a **behavioural** check: read the signal profile, browse Following,
read it again, assert it did not move. Both are needed — the structural one fails when the
dependency appears, the behavioural one fails when the effect appears.

**Alternatives rejected**: fan-out-on-write / materialised timeline — forbidden by
001/FR-017 + SC-009 and by Principle II's precomputation clause, and 001/D1 exists to
prevent exactly this being "optimised" in. Reusing `CandidateSource` with ranking disabled —
it reads interest partitions, not author partitions, and giving it a mode is how the
selection path acquires a second meaning.

---

## R4 — Sending a post to a stranger: the server is already finished

**Decision**: add **no API endpoint**. US4 is a mobile share sheet with a recipient picker
(reusing people search, A34) plus an exit to the platform share mechanism.

**Rationale**: read the controller. `PUT /v1/conversations/with/:handle` opens a pair
conversation idempotently over the derived id — including with somebody never messaged, at
which point 004/005's request rules apply unchanged (FR-012 asks for exactly that).
`POST /v1/conversations/:id/messages` already accepts `sharedPostId`, and `MessagePresenter`
already resolves the shared post **per reader** through the visibility boundary, returning
`sharedPostUnavailableReason` rather than the content — which is FR-013 and SC-007 already
implemented and already tested.

FR-014 (a send a block forbids is refused without revealing the block) is `ConversationAccess`,
which exists. It is **verified**, not reimplemented: an integration test through the hostile
path, per Principle III.

**Alternatives rejected**: a dedicated `POST /v1/posts/:id/send` — a second way to write a
message, which would need its own access check, which is the two-predicates failure in a
new place.

**Consequence worth stating**: US4 is much cheaper than the spec's placement at P1 implies,
and that is a finding, not a discount. The expensive part of Phase B is US5.

---

## R5 — The avatar: one profile projection, and it must be presigned

**Decision**: introduce `PublicProfileProjection.toPublicProfile()` — the single place a
`PublicProfile` is built — and route all seven current hand-written projections through it.
`PATCH /v1/me` accepts `avatarUploadId`; the server derives the key from **its own upload
record**. The projection presigns `avatarKey` through the same `presignedGetUrl` used by
`toMediaItem`.

**Rationale**: three findings, and each is an instance of a defect this project has already
recorded.

1. `avatarKey` has **no writer**. The upload kind `avatar` is accepted by
   `POST /v1/media/uploads` and `media.limits.ts` has an `avatar` entry — the upload half
   was built and the setting half never was. That is a **fifth** instance of the pattern
   this feature exists to end.
2. `person.controller.ts:42` emits `avatarUrl: p.avatarKey` — **the raw storage key,
   presented as a URL**. Against a private bucket a client would get a 403, which is
   precisely 006/R4b's `MinioObjectStore.publicUrl` defect in a second place.
3. `avatarUrl` is emitted on **one** of seven profile projections. SC-008 says 100% of
   surfaces. Seven hand-written projections is seven chances to omit a field — the same
   argument as one `VisibilityFilter` and one `PostQueryService.responseFor`, and this
   codebase has shipped that defect six times already.

Deriving the key server-side rather than trusting a client-supplied one is 002's second
defect, which let a post point at another person's media.

**Guard**: a structural test that no module outside `profile.projection.ts` constructs an
object literal with both `handle` and `displayName`. It will need the comment-stripping
treatment 004 and 007 both had to add — a guard that reads prose describes the intention,
not the build.

**Alternatives rejected**: adding `avatarUrl` to each site (seven places to forget an
eighth); serving avatars from an open bucket (reverted once already, in 006, and the
reasoning I gave for reverting it was itself wrong — the reason is that presigning is
bounded authorisation and an open bucket is not).

---

## R6 — Post text search: a term index in the existing table

**Decision**: on publish, tokenise the caption, and write one `TERM#<token>` candidate row
per distinct token (capped at 40 per post). Search queries the term partitions, intersects,
then passes candidates through `VisibilityFilter`. No new store, no new service, no new GSI.

**Rationale, and why this is not a Principle II violation**: a term index selects
candidates. It is structurally identical to `postInterestIndex` and `postPlaceIndex`, which
are candidate indexes the boundary then filters — and 004 recorded that making
`postPlaceIndex` structurally identical to `postInterestIndex` is what kept the place page
"one more row in the matrix rather than a new class of test". The same holds here. The index
is **never consulted to decide** whether a viewer may see a post; SC-009's second half
("unfindable by viewers who may not see it") is delivered by the filter, not by the index.

Why not the alternatives:

- **A `Scan` with a `FilterExpression`** is unbounded and its cost grows with the whole
  table regardless of how few posts match. It also reads items the caller may not see and
  discards them, which is fine for correctness and terrible for cost.
- **An in-memory index**, the way `CatalogueSearch` caches interests (001/D3), works
  because the catalogue is *small and slow-changing*. Posts are neither, and the cache would
  have to be rebuilt or invalidated per publish.
- **OpenSearch** is what 001/D3 explicitly names as the replacement "when post-content
  search arrives". This is that moment — and the Cost and Environment constraint bars it
  without specific owner approval. So it is recorded as the **deferred replacement behind
  the same interface**, which is what D3 designed for, and the term index is what ships.

**Two things the first version of this decision left out, both found by the analysis pass
and both the same shape as the defect this feature exists to end:**

1. **The term row denormalises `visibility` and `processingState`, and MUST join the update
   fan-out.** `postInterestIndex` already carries them so the filter runs on Query results
   without a second read, and `post-update.transaction.ts` keeps every index item in sync —
   its comment says an index item whose visibility drifts from the post's *"is exactly the
   SC-009 failure this class exists to make impossible"*. Copying the projection without
   joining the fan-out reproduces that defect; projecting nothing forces an N+1 read per
   result. The first draft of this decision projected only `authorId` and said neither.
2. **A caption edit rewrites the term rows.** Captions are editable via
   `PATCH /v1/posts/:postId`. Nothing in the first draft re-indexed on edit, which would
   leave a post findable by a word its caption no longer contains and unfindable by one it
   now does — an index that is wrong in a way nobody would notice, which is the worst kind.

**Honest limit**: tokenisation is whitespace-and-punctuation splitting with case folding.
No stemming, no phrase queries, no relevance ranking beyond recency. SC-009 asks for
findability "by any distinctive word", which this meets; it does not claim more.

FR-021 (search records no signals) gets the same structural guard as R3.

---

## R7 — Reply nesting: one level, and the spec was right to flag it

**Decision**: a comment carries an optional `parentCommentId` naming another comment on the
same post. **Display** is bounded at one level; a reply to a reply attaches to the deepest
permitted ancestor (FR-025) rather than being refused.

**The challenge the spec asked for, answered**: the bound is a *display* rule, not a storage
one. `parentCommentId` has no depth limit of its own, and FR-025's attach-to-ancestor rule
means the stored graph stays truthful even where the display flattens. So deepening later is
a rendering change, not a migration — which is why one level is a safe default rather than a
corner to be painted into.

**Storage**: replies keep the existing `COMMENT#<createdAt>#<id>` key inside the post
partition, so listing comments stays one Query (unchanged access pattern) and grouping
happens in the service.

**FR-026 (a moderated parent leaves its replies readable)**: removal must **not** cascade.
The parent renders as removed, with its replies intact — the same `moderationState:
'visible' | 'removed'` shape `messageSchema` already uses. A cascade would delete other
people's content as a side effect of one moderation decision, which the append-only-log
requirement of Principle IV is designed against.

---

## R8 — Comment edit and delete: transactional counts, hostile-path refusal

**Decision**: `editedAt` on the comment (FR-027's "marked as edited" is the presence of the
field, not a flag that could disagree with it). Delete is a soft delete plus a
`commentCount` decrement **in the same `TransactWriteItems`** as the delete.

**Rationale**: CLAUDE.md records that this project's "atomic add" on counts is in fact a
read-modify-write and says so in its own repository comment. A delete that decrements
separately can leave the count and the rows disagreeing, which is exactly what 005/R5 made
transactional for ratings. Same argument, same mechanism.

FR-029's refusal is tested through the path a modified client would take — a direct request
with somebody else's `commentId` — because Principle III says a test that drives only the
first-party client does not verify a server-side guarantee.

---

## R9 — Mentions: resolved at write time, stored, never re-parsed

**Decision**: parse `@handle` when a caption or comment is written, resolve each to a
`userId`, and store the resolved list on the item. Rendering reads the stored list.

**Rationale**: re-parsing at read time means a handle change silently re-points an old
mention at whoever holds that handle now. Resolution is a fact about the moment of writing.
It also makes FR-033 (an unknown handle renders as plain text) a *write-time result* rather
than a lookup on every render.

**FR-032**: the mention notification passes the same block check as any other notification —
no notification, and no disclosure of the mention, across a block in either direction. This
reuses `decideAuthoredRules`' block question rather than asking it again.

**FR-031** is subject to notification preferences, which means `mention` becomes a fourth
declared kind — and 004 recorded that adding a kind to the list that *describes*
notifications without adding it to the list that *renders* the switches is how FR-031's
message toggle came to not exist. Both lists, or neither.

---

## R10 — Alt text: on the media item, editable with the post

**Decision**: `altText` on the media item, set at publish, editable wherever the post is
editable (FR-036). FR-035's fallback announces the post's interest and author rather than
the word "image".

**Rationale**: the description belongs to the image, not the post, because a post has up to
ten of them — which is only true once US1 ships, and is the reason US10 sits behind it.

**Measurement for SC-011 ("100% of images")**: a mobile guard enumerating every `Image`
render and asserting each has an accessibility label from either source. This is the
per-tag treatment 007's touch-target guard had to be rewritten into — a per-file check
lets one labelled image approve every other image in the same file.

---

## R11 — Drafts: private by key, holding uploads rather than media

**Decision**: `USER#<id> / DRAFT#<draftId>`, holding caption, interestIds, placeId and
**uploadIds** — not media rows. Publishing a draft calls the existing publish path with
those uploadIds.

**Rationale**: private by key is the `savedPost` argument (A32) — it lives in the owner's
own partition and no index projects it, so there is no query anyone else can write that
reaches it. That is stronger than a check every reader must remember to perform.

Holding uploadIds rather than media rows means a draft is a *pre-publish* object and the
publish path is unchanged, so a draft cannot become a second way to create a post. FR-038's
"stops being a draft once published or discarded" is then a delete in the publish
transaction.

**Open consequence, stated**: an upload target expires. A draft older than its uploads'
expiry restores caption, interest and place but not media, and must say so rather than
appearing to have lost data silently. SC-012 measures a draft restored within the upload
lifetime.

---

## R12 — Mute and dismissal are **selection**, never the boundary

**Decision**: applied in `CandidateSource` (and in `FollowingFeedService`'s selection), and
**forbidden inside `VisibilityFilter`**. Enforced by a structural guard that fails the build
if the filter imports the mute or dismissal repository.

**Rationale — this is the load-bearing decision of the feature**. Ask the question the
boundary answers: *may this viewer see this post?* Muting somebody does not change that
answer. The follow survives (FR-039), the conversation survives, and their profile stays
readable — a muted person's posts are still there if you go and look. Mute means *do not
select*, which is precisely what Principle II's second clause assigns to the ranker.

Putting mute in the filter would make a muted person's **profile empty**, which is not what
mute means and is not what any requirement asks for, and it would give the one boundary a
second meaning that every future surface would inherit without asking for it.

Dismissal (FR-041, FR-042) is the same: suppress that post from candidate sets **and** feed
it to the ranker as a negative signal. Being a signal is why it is doubly a selection
concern.

**FR-040 (invisible to its subject)**: a mute is stored only in the muter's partition, with
no inverted index. There is therefore no query the subject can write that reaches it —
the same structural privacy as `savedPost`, rather than a rule someone must remember.

---

## R13 — Private accounts **are** the boundary, and are one clause

**Decision**: add `authorPrivacy: 'open' | 'private'` to `VisibilityCandidate`. In
`decide()`, when the author is private, a `public` post is evaluated by the `followers`
rule. Nothing else changes anywhere.

**Rationale**: apply the same test as R12 and the answer inverts. Making an account private
**does** change whether a viewer may see a post, on every surface simultaneously, and
001/FR-017 + SC-009 require that flip to land everywhere immediately. That is the boundary's
job and nothing else's.

The elegance is the point: one candidate field and one clause means **every existing
surface inherits the rule with no change** — feed, interest space, place page, search,
notifications, shared posts in messages. A per-surface privacy check would be a second
predicate on eleven surfaces, which is the exact failure Principle II names.

**FR-045 (existing followers keep access)** then needs no code at all: the `followers` case
reads the person-follow, and flipping privacy does not touch follows.

**Follow requests** (FR-043) reuse the conversation request shape — pending / accepted /
declined on the follow row — rather than inventing a second approval mechanism. 005/R2's
finding applies directly: state belongs on the **participant** row, not on a shared item, so
the pending state lives on the follow itself.

---

## R14 — Appeals: the report queue's shape, deliberately

**Decision**: `APPEAL#<appealId> / #META` with a GSI1 state partition
(`ASTATE#<state> / TS#<createdAt>`), mirroring `reportByState` exactly. The decision is
appended to the existing `MODLOG#` log.

**Rationale**: the report queue is already an oldest-first Query on GSI1 whose partition key
follows the state, so a transition moves the item between queues with one write. Copying the
shape means the appeal queue is one more row in the visibility matrix rather than a new
class of thing to reason about — the same argument `postPlaceIndex` made for places.

Constitution IV requires the moderation log be append-only and survive deletion of the
subject; an appeal outcome is a moderation decision and goes in it.

**FR-048 (readable by author and moderators only)** goes through the boundary like
everything else, and appears in the matrix.

---

## R15 — Collections: additive to saved, private by key

**Decision**: `USER#<id> / COLLECTION#<id>` for the collection, and
`USER#<id> / COLLITEM#<collectionId>#<savedAt>#<postId>` for membership. Adding to a
collection writes the membership row **and** the existing `savedPost` rows in one
transaction.

**Rationale**: FR-051 says a post in a collection stays in the undifferentiated saved list.
Making membership *additive in one transaction* means the two cannot disagree — a
collection add that "moved" a post would be a bug nobody could see until someone looked for
a post that was still saved.

Private by key again (A32's argument): both item types live in the owner's partition and no
index projects them. FR-050's "readable only by its owner on every surface" is then
structural, and SC-015 measures it through the hostile path.

**Collection names are user-generated text** and therefore reportable and moderatable
(Principle IV, and 005 already established this for conversation names).

---

## R16 — FR-054: what a "every declared field has a writer" guard can and cannot do

**Decision**: two specific guards, and an explicit statement of what neither catches.

1. **Response-shape fixture** (extends `apps/e2e/journeys/response-shape.spec.ts`): every
   optional field declared in a response schema must be **non-null in at least one fixture**.
   This would have caught `readAt` (never written) and `avatarUrl` (emitted on one surface).
2. **Multi-item render fixture** (mobile): post-rendering tests use a fixture with more than
   one media item. This would have caught `media[0]`.

**What neither catches**, said plainly because the alternative is a guard that reads as
coverage: a field the server populates correctly and a client ignores, where the client test
stubs the data layer with the same wrong shape. That is 007's `ApiPage<T>` defect — five
features of green tests agreeing with each other and neither agreeing with the server — and
the only thing that finds it is a **request**. Which is why every phase of this feature ends
with an HTTP journey and a device run, not with a green unit suite.

A general "every declared field has a writer" checker is not proposed, because writing one
that passes vacuously is easier than writing one that works, and a vacuous guard is worse
than none — it counts as coverage. `browser/measure.spec.ts` had zero assertions and was
committed as a Phase 5 deliverable; that is the failure mode being avoided here.
