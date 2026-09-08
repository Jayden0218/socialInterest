# Research — 007 Ranked Feed and App Redesign

Seven decisions. Each records what was chosen, why, and what was rejected, so that
implementation does not re-open them and a later reader can see the reasoning rather than
infer it.

---

## R1 — Where do candidates come from, now that there is no follow set?

**Decision**: candidates come from the **existing post-interest index**, queried across two
sets of partitions: the interests weighted highest in the viewer's signal profile, and an
exploration sample (R5). The fan-in machinery already built for the composed feed is
reused unchanged; only the choice of which partitions to read moves from "the interests
you follow" to "the interests your behaviour points at, plus some you have not seen".

**Rationale**: the interest is the only classification the product has, and Constitution
2.0.0 keeps every post filed under one. So the index that already partitions posts by
interest is exactly the candidate source a ranked feed needs. Reusing it means the
latency behaviour of a feed request is already characterised, no new index is written on
the publish path, and the bounded fan-in that 001 measured still applies.

**Alternatives rejected**:

- **A global recency index over all posts** (a new GSI, hot partition, ranked afterwards).
  Costs a GSI and a write on every publish, and produces candidates carrying no signal —
  the ranking would have to score the whole corpus to find anything relevant.
- **A materialised per-viewer candidate list.** Directly prohibited: Principle II forbids
  serving a set assembled before the viewer was known, and it is what D1 exists to avoid.
- **An embedding index over post content.** No content model exists, and it would make
  FR-011 (explain the feed in plain language) impossible to satisfy honestly.

---

## R2 — What is a signal, and how does it become a preference?

**Decision**: four signal kinds, folded into a **weight per interest**.

| Signal | Weight | Note |
|---|---|---|
| Opened a post | 0.3 | Weakest — an open can be a mis-tap |
| Dwelt on a post | `min(seconds, 30) / 30` × 1.0 | Counted only above 3s; capped at 30s |
| Liked | 1.0 | Explicit |
| Saved | 2.0 | The strongest signal a person gives: they intend to come back |

Weights accumulate per interest and **decay with a 14-day half-life**, applied at read
time from a stored timestamp rather than by rewriting rows.

**Rationale**: the profile is keyed by interest because the interest is the product's unit
of meaning (Principle I) and because it is the only representation that can be stated back
to a person in words. "You watch climbing posts to the end more often than anything else"
is derivable from an interest weight; nothing equivalent is derivable from a latent vector.
FR-011 is a requirement, and it constrains the model — not the other way round.

Save outranks like because a like is cheap and social, a save is intent. Dwell is capped
because an uncapped dwell measures a person who left their phone on the table.

**Alternatives rejected**:

- **Including reports and comments as positive signals.** Excluded deliberately, and it is
  the most consequential decision here. A report is not a preference. Treating
  engagement-with-bad-content as interest is the standard mechanism by which a ranked feed
  amplifies harm, and excluding it upfront is far cheaper than detecting it later.
- **A per-post collaborative model** ("people like you liked this"). Needs a user base the
  product does not have, and cannot be explained in the terms FR-011 requires.
- **Linear decay or a fixed window.** A window drops history discontinuously; exponential
  decay lets an old interest fade without a cliff, and needs one stored timestamp.

---

## R3 — Where do signals live?

**Decision**: two new item types on the **existing single table**. No new GSI.

- `USER#<id>` / `#SIGNALPROFILE` — one small item holding `{ interestId: {weight,
  updatedAt} }`. Updated in place on ingest by read-modify-write, not an atomic `ADD` — see `data-model.md`.
- `USER#<id>` / `SIGNAL#<ts>#<postId>` — the raw events, with a **30-day TTL**.

**Rationale**: the profile is one item, read once per feed request — the cheapest possible
read for the hottest path. The raw events exist so that "clear my signals" can be honest
(FR-012 deletes both) and so a bug in the folding can be diagnosed against what actually
happened. TTL bounds them without a job.

Decay is applied **at read time** from `updatedAt`. Folding decay into storage would mean
rewriting every profile on a schedule, which is a scheduler, a failure mode, and a cost,
to compute something a single exponent produces on read.

**Alternatives rejected**:

- **A separate signal store.** New infrastructure, new failure mode, and a spend decision
  the constitution's cost section forbids taking implicitly.
- **Raw events only, folded per request.** A feed request would read an unbounded event
  history. The fold is a running total; storing it is the point.
- **No raw events.** Cheaper, and it makes reset unverifiable and misbehaviour
  undiagnosable.

---

## R4 — What does a new account see?

**Decision**: a **one-time first-run selection** writes `USER#<id>` / `#SEEDINTERESTS`,
which initialises the signal profile with a modest uniform weight. Behaviour overtakes the
seed within a session or two. Skipping it is permitted; the feed then draws from the most
active interests in the catalogue.

**Rationale**: FR-014 is explicit that seeds are not follows. Storing them as interest
follows would be the easy path and would quietly recreate a subscription feed — the exact
thing this feature removes — because every later reader would treat a follow as a follow.
A distinct item type makes the difference structural rather than conventional.

**Alternatives rejected**:

- **Reuse interest follows.** Rejected above; it would reintroduce the subscription model
  through the back door.
- **No cold start, rank from nothing.** Produces an arbitrary first feed, which is the
  first impression the product makes.
- **An onboarding sequence.** Out of scope by assumption; one screen, once.

---

## R5 — How is collapse prevented?

**Decision**: **epsilon-greedy exploration at ε = 0.2.** Every feed page draws about a
fifth of its candidates from interests outside the viewer's weighted set, sampled from the
catalogue and ordered by recency.

**Rationale**: this is a correctness requirement (FR-007), not a product preference. A
purely exploitative ranker is a positive feedback loop: it shows what the profile favours,
the profile is updated only from what was shown, and the signals that would broaden it can
never be generated. The feed narrows and cannot recover, and no amount of later tuning
helps because the data to tune on was never collected.

ε = 0.2 is a starting value, not a measured optimum — one card in five on a page of four
to five visible posts. It is a constant with a name, so it can be changed with evidence.

**Alternatives rejected**:

- **Thompson sampling / bandit with posterior updates.** The principled answer, and it
  needs interaction volume the product does not have. Premature.
- **No exploration.** The collapse above.
- **Exploration only when the profile is sparse.** Fails exactly when it is needed: a
  dense profile is precisely a narrow one.

---

## R6 — A two-column waterfall in React Native, without breaking virtualisation

**Decision**: **block-wise waterfall.** The feed is chunked into blocks of 8 posts; each
block lays out as an independent two-column waterfall (each card goes to the shorter
column by accumulated height); a single `FlatList` virtualises the blocks.

**Rationale**: React Native has no native masonry list. The obvious options each break
something:

- `FlatList numColumns={2}` renders **rows**, so the two cells in a row are bottom-synced.
  That is a ragged grid, not a waterfall, and it is visibly not the approved design.
- Two `FlatList`s inside a `ScrollView` gives true independent flow and **nests
  VirtualizedLists** — React Native warns about it because it disables windowing, and an
  infinite feed then holds every card mounted.

Chunking gets both: columns flow independently inside a block, and the list still
virtualises. The cost is that the columns re-sync every 8 cards. On a screen showing four
to five posts, that boundary is below the fold more often than not.

**Alternatives rejected**:

- **`MasonryFlashList` (`@shopify/flash-list`).** The correct library answer and a real
  candidate. Rejected for now because it is a NATIVE module, and this project has already
  lost a device run to a native module installed the wrong way — `expo-image-picker@57`
  against SDK 54's `expo-modules-core@3` killed the app at module registration. Adding one
  is a decision to make with a device run behind it, not inside a redesign.
- **Absolute positioning with measured heights.** Requires measuring before painting, so
  the first frame is empty or wrong.

**If the re-sync is visible**, the fallback is `MasonryFlashList` installed with
`expo install`, verified by an emulator run before anything else lands on top of it.

---

## R7 — How is dwell measured honestly?

**Decision**: `FlatList`'s viewability callbacks with `itemVisiblePercentThreshold: 60`
and `minimumViewTime: 300`, a clock stopped by `AppState` on background, a per-post cap of
30s, and batched flush every 30s and on background.

**Rationale**: FR-004 requires that dwell counts only while the post is on screen and the
app is in the foreground. Each part of that maps to one mechanism: viewability gives "on
screen", `AppState` gives "foreground", the cap bounds a phone left face-up, and batching
keeps the feed from issuing a request per card.

60% and 300ms are chosen so that a card scrolled past at speed does not register as
attention.

**Alternatives rejected**:

- **Time between opening and leaving a post detail.** Misses the feed itself, which is
  where nearly all viewing happens.
- **Per-event requests.** One request per card is a request storm and a battery cost.
- **Trusting the client's reported duration without a cap.** A hostile client can report
  anything; the server clamps to the same 30s ceiling. Principle III: the guarantee is
  enforced where the client cannot bypass it.

---

## Open, and deliberately not decided here

- **Ranking quality.** SC-001 asserts the feed moves in the direction of the signals. What
  "good" means needs real usage, which the product has never had.
- **Whether ε = 0.2 is right.** It is a named constant precisely so the first real usage
  data can change it.
- **Whether the block size of 8 is visible.** R6's fallback exists for that answer.
