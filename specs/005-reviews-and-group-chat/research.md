# Research: place reviews and group conversations

Ten decisions. Each records what was chosen, why, and what was rejected — the same format
as 001's D1–D9 and 004's R1–R11, and for the same reason: the next person to read this
should be able to tell an arbitrary choice from a forced one.

Two of these (R1, R3) were forced by facts measured in the existing code rather than
chosen freely, and both are recorded with the measurement.

---

## R1 — Group conversations get a random identifier; pair conversations keep the derived one

**Decision**: `conversationId` becomes two things distinguished at creation. A conversation
between exactly two people keeps `conversationIdFor(a, b)` — the sorted-pair hash — and all
of its current behaviour. A conversation with three or more gets a ULID, like every other
entity in this system.

**Rationale**: The derived id is not an implementation detail that happens to be convenient;
it is what makes "open a conversation with this person" idempotent with no uniqueness item
and no race. Two people tapping at once compute the same id and the conditional put makes
the loser a no-op.

None of that survives contact with a group, for a reason that is structural rather than
awkward: **the id would have to change when membership changes.** FR-020 requires adding a
person to an existing group. If the id is derived from the participant set, adding somebody
produces a different id — so the conversation everyone was reading ceases to exist and a new
empty one appears. The messages would have to be rewritten under the new key on every add.

The idempotency the derived id buys is also not something a group needs. "Open a
conversation with Sam" is a lookup that should always land in the same place. "Start a group
with Sam, Alex and Jo" is a deliberate act of creation, and a person doing it twice
genuinely means two groups — the same way two documents with the same title are two
documents.

**FR-027 falls out of this rather than needing its own mechanism**: creating a "group" with
exactly one other person is routed to the pair path at creation, so it finds the existing
conversation instead of making a parallel one.

**Alternatives rejected**:

- *Derive from the sorted participant set.* Fails FR-020 outright, as above.
- *ULIDs for everything, migrating existing pairs.* Rejected by FR-026 and SC-008: existing
  conversations must keep their identifiers. It would also throw away the race-freedom of
  the pair case for no gain.
- *Derive from the CREATOR plus a nonce.* A ULID with extra steps.

---

## R2 — Conversation state moves from the conversation to the participant

**Decision**: `state` becomes a property of a participation, not of a conversation. The
conversation item stops being the authority for it.

**Rationale — this is the measured one.** `ConversationRepository`'s own comment currently
reads:

> The meta item is the AUTHORITY for `state`; the two participant rows carry a copy so an
> inbox renders from one Query. On disagreement the meta item wins.

That works because a pair has exactly one shared state: the conversation is requested, or
accepted, or declined. **A group does not have one state.** Alice accepts, Bob has not
looked yet, Jo declined. There is no single value the conversation item could hold that is
not a lie about at least one participant.

The pleasing part is that the storage for this **already exists and is already the right
shape**. `ConversationParticipantItem` carries `state`, and the inbox index puts it in the
GSI5 partition key (`USER#<id>#<state>`), which is what makes "my requests" and "my inbox"
one query each. The per-participant row was always the thing being read; the conversation
item was a denormalised copy that a pair happens to make consistent.

So this is less a new design than the removal of a copy that only worked for two people —
the same shape as 004's two notification-category lists, where the duplicate was not a risk
of drift but was the drift.

**Alternatives rejected**:

- *Keep conversation-level state and give groups a second state field.* Two authorities for
  one concept, chosen by participant count. This is the defect pattern this codebase has
  hit five times.
- *Derive group state from the participants (e.g. "accepted if anyone accepted").* There is
  no aggregate that answers "may this person read it", which is the only question state is
  for.

---

## R3 — The participant cap is a correctness constraint, not a product preference

**Decision**: 20 participants, enforced server-side, and the plan treats the number as
load-bearing.

**Rationale**: The spec offered 20 as a product assumption. Reading the persistence layer
shows it is also a transactional one. `ConversationRepository`'s comment continues:

> Every state change writes all three in ONE TransactWriteItems. The set is fixed at three,
> so it is always inside DynamoDB's limits — unlike a design where the participant set can
> grow, which is one of the reasons group chat is out of scope rather than "later".

A membership change writes the conversation item plus one row per participant. DynamoDB's
`TransactWriteItems` takes at most 100 items, so an unbounded group cannot keep its
membership atomic. **A cap of 20 keeps the worst transaction at 21 items**, comfortably
inside the limit, and that is why the cap must be enforced where a modified client cannot
raise it (FR-031).

This is worth writing down because a later "let's allow 50" reads like a product tweak and
is one — up to about 99, after which it silently stops being atomic.

**Alternatives rejected**:

- *No cap, with non-atomic membership updates.* A partial membership write leaves somebody
  able to read a conversation they were removed from, or unable to read one they are in.
- *Cap of 100.* Right at the limit, leaving no headroom for the conversation item itself or
  any future per-conversation row.

---

## R4 — Reviews use the visibility module, through a second entry point, not the post table

**Decision**: reviews are decided inside `visibility/`, by a new entry point beside
`decide()`, and the block resolution both use is extracted into one function that neither
copies.

**Rationale**: Principle II's rationale is that "six independently written predicates give
six chances to leak". The naive reading — push reviews through `decide()` — fails on the
shape: `VisibilityCandidate` requires `postId`, `visibility` and `processingState`, and a
review has none of them. Passing a review as `{ postId: reviewId, visibility: 'public',
processingState: 'ready' }` would be inventing three fields to satisfy a signature, and
inventing fields to fit a shape is precisely the defect this codebase has now shipped
**seven times** (persistence rows escaping as responses, candidate rows returned as
answers).

The rules that actually apply to a review are a strict subset of the post rules: gone
(deleted or removed by moderation), author account status, and blocks in **both**
directions. There is no audience setting to evaluate because a review has no audience — it
is as visible as the place page it sits on.

So: one module, two entry points, **one block-resolution function shared between them**.
The sharing is the point. Two entry points that each read `blocks` independently would be
exactly the two predicates Principle II forbids; a single `RelationshipCache` and a single
"is either of these two people blocking the other" function is one predicate with two
callers.

**Alternatives rejected**:

- *A `ReviewVisibility` service in `places/`.* This is 001/D6 again — the reason
  `VisibilityFilter` is top-level rather than a helper in `posts/` is that a visibility
  check inlined next to its caller is a visibility check nobody will find later.
- *Give reviews a `visibility` field so they fit `VisibilityCandidate`.* Adds a product
  concept (private reviews) that nobody asked for, purely to satisfy a type.
- *Widen `VisibilityCandidate` to make post fields optional.* Every existing caller then
  compiles while meaning less, and the post decision table gains branches for states posts
  cannot be in.

---

## R5 — The place's rating summary is maintained transactionally, not computed on read

**Decision**: the place item carries `ratingSum` and `ratingCount`. Every rating write —
create, replace, withdraw, moderator removal — updates the rating row and the place's two
counters in one `TransactWriteItems`.

**Rationale**: FR-007 requires a rating change to be visible everywhere immediately, which
rules out any cached or periodically recomputed aggregate. That leaves computing on read or
maintaining on write.

Computing on read means querying every rating for a place on every place-page view. That is
unbounded work proportional to a place's popularity, on the surface most likely to be
popular — the worst possible place to put an unbounded query.

Maintaining on write is bounded, and the transaction is small: two items. The replace case
(FR-002) is the one that needs care and is the reason this is transactional rather than two
writes — it must add the new score and subtract the old one, and a crash between those two
leaves a place permanently mis-rated with nothing to detect it.

**This is not fan-out-on-write and does not contradict 001/D1.** D1 forbids materialising
*visibility-dependent* results, because a visibility flip must land everywhere immediately.
A rating count is not visibility-dependent: it is the same number for every viewer.

**Alternatives rejected**:

- *Compute on read.* Unbounded, as above.
- *A separate aggregate item.* One more item to keep consistent with no benefit; the place
  item is already read on every place-page view.
- *Eventually consistent via the event bus.* Directly contradicts FR-007.

---

## R6 — A removed review takes its rating with it

**Decision**: moderator removal of a review decrements `ratingCount` and subtracts from
`ratingSum`, exactly as a withdrawal does.

**Rationale**: FR-016 says a removed review must not count toward the average. The
alternative — keep the score, drop the text — is defensible in principle and wrong here:
the moderation cases that produce a removal (abuse, spam, a competitor's sabotage) are
cases where the score is as untrustworthy as the words. Leaving a 1-star rating from a
removed abusive review would make removal a partial win for the abuser.

Consequence to state plainly: **moderation changes a place's public rating.** That is
intended, and it is why the decision is written into the append-only log like every other
moderation action.

---

## R7 — Reviews and group names extend the existing reporting enum

**Decision**: `subjectType` gains `review` and `conversation-name`. No new reporting path.

**Rationale**: measured — `safety.controller.ts` already declares
`z.enum(['post', 'comment', 'interest', 'message', 'place', 'interest-description'])`, and
`moderation.controller.ts` already branches `remove_content` per subject type. Two enum
entries and two branches is the whole of it.

This is worth stating because the spec could easily have been written as though reviews
needed a moderation system. They need a moderation *case*. Reporting the shape of the work
honestly is more useful than inflating it, and 004's spec made the opposite error in the
opposite direction.

**Alternatives rejected**: a separate review-report entity, for symmetry with nothing.

---

## R8 — A group name is content, and is removed by blanking rather than deleting

**Decision**: removing a group name under moderation clears it; the conversation and its
messages are untouched, and it falls back to being identified by its participants.

**Rationale**: this mirrors the rule the 004 addendum already sets for messages — removing a
message withholds its body and leaves the thread readable, because silently deleting a
conversation is indistinguishable from a bug to the people in it. A group whose name was
abusive is still a group of people who were talking; destroying the conversation punishes
everyone in it for one person's text.

---

## R9 — Existing conversations are migrated by backfill, and the migration is tested against rows the old code wrote

**Decision**: a one-time backfill copies each conversation's authoritative `state` onto its
participant rows, after which the conversation item's `state` is no longer read. The test
for it creates rows **using the previous version's write path** and then reads them through
the new one.

**Rationale**: R2 moves the authority. Every conversation already written has its state on
the conversation item, and the participant rows carry a copy that the pair case keeps
consistent — so in practice the data is already correct and the backfill is close to a
no-op. "Close to a no-op" is exactly the kind of claim that turns out to be false for the
one row that matters.

SC-008 is written the way it is for this reason: verifying "existing conversations still
work" by creating new ones under the new code proves nothing at all about the rows already
on disk. This project has shipped that shape of test before — 001's suites called
`reconcile()` by hand and hid a defect that made the entire product unusable.

**Alternatives rejected**:

- *Dual-read forever* (prefer the participant row, fall back to the conversation item).
  Leaves two authorities permanently, which is R2's whole objection.
- *No migration, on the grounds that DynamoDB Local holds no real data.* True today and
  false the moment there is a deployment; and it would leave SC-008 unmeasurable, which the
  constitution treats as unmet rather than fine.

---

## R10 — Group long-poll reuses the existing waiter, and adds no new divergence

**Decision**: delivery to a group uses `EventWaiter` and the durable event bus exactly as
the pair case does. One message resolves up to 19 waiters instead of one.

**Rationale**: measured in 004 — one API process held **200 concurrent long polls with
delivery p95 51ms**. A 20-person group at the same total number of waiting clients is the
same load with a different distribution; nothing about fan-out to 19 waiters in one process
is near that ceiling.

**No new divergence is registered.** `D-004-1` already records that HTTP long-poll is a
local-profile choice whose behaviour under a hosted deployment is unverified, and every
reason that entry exists is untouched by the number of participants. Adding `D-005-x` for
the same fact would make the register longer without making it more true.

What this does **not** establish, and the plan says so: that a hosted deployment can hold
these connections. That is `D-004-1`'s open question and it stays open.
