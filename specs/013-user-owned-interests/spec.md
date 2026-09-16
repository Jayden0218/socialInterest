# Feature Specification: The Interests Belong to the People Using Them

**Feature Branch**: `claude/pensive-goldberg-jjjni5`

**Created**: 2026-09-16

**Status**: Draft

**Input**: Owner: *"just share post, and no need to specific category the interest, as it will be
category by user, not by us"* — then, on the shape: *"remove the twelve, use hashtag like, it may
be merge when the backend find out that these two word is similar, like in the internet search"*

## Why this exists

The product ships a catalogue of **twelve** interests that we wrote. Every post must be filed
under one of them, and a person who wants to post about something we did not think of has two
options: pick a parent of ours and create a sub-interest under it, or pick the least wrong of the
twelve. Both are us telling somebody what their own photograph is about.

The owner's instruction is to hand the taxonomy over. An interest becomes something a person
names, flat, like a hashtag — and there will be a great many of them.

**This is not a constitution amendment, and that was checked rather than assumed.** Principle I
requires that every post is filed under at least one interest and that interests stay first-class
surfaces. It is **silent on who creates them** — the words "curated", "catalogue" and "operator"
do not appear in it. Every post still carries an interest here. Interest spaces, interest search
and the interest shown on a post all stay. What changes is whose vocabulary it is.

**Most of this is already built**, which is why the feature is smaller than it sounds. People can
already create interests; exact duplicates are already refused; a proposed name that resembles
existing ones already comes back with the list for the person to acknowledge; and a merge already
moves posts and followers and leaves a permanent redirect behind. The catalogue being ours rests
on **one required field**.

### The thing that will break silently if it is missed

The duplicate gate compares a proposed name **only against its siblings** — the interests sharing
its parent. That is nearly right while every interest has a parent. The moment interests are flat,
a new name is compared against **nothing**, and the single most effective control against sprawl
stops working at exactly the moment it starts to matter. No request fails. No test goes red. The
feature would simply not do its job, quietly, forever.

### What "merge when two words are similar" can and cannot mean

The owner asked for near-duplicates to converge automatically, "like in the internet search". The
distinction that makes that work is between two different operations, and it was **measured on
this product's own similarity function** rather than argued:

| Score | Pair | |
|---|---|---|
| 1.00 | Bouldering / bouldering | identical once normalised |
| 1.00 | Bouldering / Bouldering! | identical once normalised |
| 0.91 | photography / photograpy | a real typo |
| 0.86 | Running / Runing | a real typo |
| **0.83** | Baking / **Biking** | **different things** |
| **0.80** | Poker / **Power** | **different things** |
| **0.75** | Golf / **Wolf**, Java / **Lava**, Wine / **Wind** | **different things** |
| 0.23 | NYC / New York City | a genuine synonym |
| 0.13 | Football / Soccer | a genuine synonym |

**No threshold separates those columns.** A cut at 0.85 catches `photograpy` and also merges
Baking into Biking. A cut at 0.95 catches almost nothing. And the merges a person would actually
want — NYC into New York City — score below 0.25, where edit distance cannot see them at all.
Edit distance measures **spelling**, not meaning.

So the answer splits in two, and both halves deliver what was asked:

- **Case, punctuation and spacing converge automatically and always.** "Bouldering", "bouldering"
  and "Bouldering!" are **one interest that was never duplicated** — there is nothing to merge,
  because a second one is never created. This is the overwhelming majority of what a person means
  by "near-duplicate", it is deterministic, and it is already implemented.
- **Anything beyond that is proposed, not performed.** The person is shown what already exists and
  chooses. Genuine synonyms are merged by an operator.

This is also what the owner's own analogy does: an internet search normalises a query and *offers*
"did you mean", and it does not merge "golf" into "wolf".

**A merge here is irreversible.** Nothing in the product can un-merge: posts and followers have
moved and the source carries a permanent redirect. An irreversible operation performed
automatically, at scale, on a signal that cannot tell Baking from Biking, is the one change in
this feature that could not be walked back.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - I name my own subject (Priority: P1)

Somebody publishing a photograph types what it is about. If that interest exists they join it; if
it does not, it comes into being with their post as its first. At no point are they shown a list
of twelve things we decided.

**Why this priority**: it is the whole instruction. Everything else in this feature exists to keep
the result navigable.

**Independent Test**: publish a post naming an interest nobody has used, on an installation with
no catalogue, and find the post in that interest's space afterwards.

**Acceptance Scenarios**:

1. **Given** an interest nobody has created, **When** a person names it while publishing,
   **Then** the post is published and the interest exists with that post in it.
2. **Given** an interest that already exists, **When** a person types its name in any casing or
   punctuation, **Then** they join the existing one and no second interest is created.
3. **Given** a person publishing, **When** they reach the interest step, **Then** they are not
   required to choose from any list the product owns.
4. **Given** a published post, **When** anybody views it, **Then** it shows the interest the
   author typed.

---

### User Story 2 - The near-duplicates do not pile up (Priority: P1)

A person naming something that resembles what already exists is shown the existing ones first, and
chooses. Sprawl is prevented at the moment of creation rather than cleaned up afterwards.

**Why this priority**: P1 alongside US1 and inseparable from it. US1 without this is a hashtag
field, and the evidence on hashtag fields is that the tag stops being worth navigating — which is
the decay Principle I exists to prevent, named in its own rationale.

**Independent Test**: create an interest, then try to create a near variant of it, and confirm the
existing one is offered before a second is made.

**Acceptance Scenarios**:

1. **Given** an existing interest, **When** a person proposes a name differing only by case,
   punctuation or spacing, **Then** no new interest is created and they are placed in the existing
   one.
2. **Given** existing interests resembling a proposed name, **When** a person proposes it,
   **Then** they are shown those and must confirm before a new one is created.
3. **Given** a person who confirms, **When** they proceed, **Then** the new interest is created
   and their post is filed under it.
4. **Given** the similarity check, **When** it runs, **Then** it considers **every** interest in
   the product, not a subset.

---

### User Story 3 - Nothing is left over from the old catalogue (Priority: P1)

The twelve are gone, and no screen, requirement or piece of copy still describes a product where
we own the vocabulary.

**Why this priority**: P1 because a half-removed catalogue is worse than either end state. 007
shipped a follow hint describing a withdrawn requirement because only the code was updated, and
that is the failure mode here at larger scale.

**Independent Test**: search the product — code, copy and specs — for the catalogue and the
sub-interest hierarchy, and find nothing that still assumes them.

**Acceptance Scenarios**:

1. **Given** the product after this feature, **When** the interests are enumerated, **Then** none
   exists that a person did not create.
2. **Given** any screen, **When** its copy is read, **Then** nothing describes choosing from a
   catalogue or nesting under a parent.
3. **Given** an installation carrying interests from before, **When** it is migrated, **Then**
   every existing post still resolves to an interest and none is orphaned.

---

### User Story 4 - Two words that mean one thing become one (Priority: P2)

Where two interests genuinely mean the same, they become one, and the person who typed either
still sees their own word on their own post.

**Why this priority**: P2 because it is repair rather than prevention, and US2 is what keeps the
volume low enough for this to be tractable. It cannot be automated on the evidence above, so it is
also the part with an ongoing human cost.

**Independent Test**: merge two interests and confirm the posts, the followers and the redirect
all land, and that the author's own post still reads as they typed it.

**Acceptance Scenarios**:

1. **Given** two interests meaning one thing, **When** they are merged, **Then** the posts and the
   followers of the source arrive at the target.
2. **Given** a merged interest, **When** anybody reaches it by its old name, **Then** they arrive
   at the surviving one.
3. **Given** an author whose post carried the merged-away name, **When** they view their post,
   **Then** it still shows the word they typed.
4. **Given** a merge, **When** it is requested, **Then** only an operator may perform it.

---

### User Story 5 - Dead interests do not accumulate (Priority: P3)

An interest that no post uses does not linger.

**Why this priority**: P3. It is housekeeping, and US1's rule that an interest is born with a post
already prevents the common case.

**Independent Test**: leave an interest with no posts and confirm it is gone afterwards.

**Acceptance Scenarios**:

1. **Given** an interest whose last post is removed, **When** the housekeeping runs, **Then** the
   interest does not remain browsable.
2. **Given** an interest with posts, **When** the housekeeping runs, **Then** it is untouched.

---

### Edge Cases

- **Two people create the same new interest at the same moment.** One interest must result, not
  two. 011 found handles were not unique at all because the constraint guarded the wrong key, and
  measured *eight of eight* simultaneous claims succeeding; the same measurement is owed here.
- **A name that normalises to nothing** — punctuation or spaces alone. There is no interest to
  create and publishing must fail rather than produce a nameless one.
- **A name that normalises onto a merged-away interest.** The person must land on the surviving
  one, not resurrect the source.
- **An extremely long name, or one in a script the normaliser does not fold.** The rule must be
  stated rather than discovered.
- **Publishing fails after the interest was created.** An interest born with a post must not
  outlive a post that never arrived.
- **The last post in an interest is deleted, hidden by its author, or removed by a moderator.**
  Whether the interest is then empty is a question about visibility, and the boundary — not the
  housekeeping job — must answer it.
- **A person is blocked by everybody who posts in an interest.** The space is empty to them. It
  must read as empty, and must not reveal that a boundary caused it.

## Requirements *(mandatory)*

### Functional Requirements

#### Naming an interest

- **FR-001**: A person MUST be able to name a post's interest freely, in their own words.
- **FR-002**: The product MUST NOT require an interest to be chosen from any list the product owns.
- **FR-003**: Interests MUST be flat. An interest MUST NOT have a parent, and the product MUST NOT
  offer nesting.
- **FR-004**: An interest MUST come into existence only as part of publishing a post into it, so
  that an interest with no posts cannot be created.
- **FR-005**: Publishing MUST still require at least one interest. There is no uncategorised post.

#### Converging on one name

- **FR-006**: Names differing only by letter case, punctuation or surrounding and repeated
  whitespace MUST resolve to the **same** interest, with no second interest created and nothing to
  merge afterwards.
- **FR-007**: A name that resolves to an existing interest MUST place the post in that interest
  without asking anything of the person.
- **FR-008**: The similarity check MUST consider **every** interest in the product.
- **FR-009**: Where a proposed name resembles existing interests without matching one, the person
  MUST be shown those interests before any new one is created.
- **FR-010**: A new interest MUST NOT be created from such a proposal until the person has
  confirmed it in the knowledge of what already exists.
- **FR-011**: The product MUST NOT merge two existing interests automatically on a similarity
  score. The scores for genuinely unrelated pairs and for real typos overlap, and a merge cannot
  be undone.

#### Repairing genuine duplicates

- **FR-012**: An operator MUST be able to merge one interest into another.
- **FR-013**: A merge MUST move the source's posts and followers to the target before the source
  begins redirecting, so that no reader sees a redirect to content that has not arrived.
- **FR-014**: After a merge, reaching the source by any means MUST lead to the target.
- **FR-015**: A merge MUST NOT rewrite the words on anybody's own post. The author's post keeps
  the name they typed.
- **FR-016**: Only an operator may merge. No ordinary person may.

#### Removing the catalogue

- **FR-017**: The product MUST ship with no interests of its own.
- **FR-018**: No copy anywhere may describe choosing an interest from a catalogue, or an interest
  nested beneath another.
- **FR-019**: Where a person previously chose starting interests from the catalogue, that step
  MUST be rebuilt around what people have created, or removed. It MUST NOT be left asking about a
  catalogue that does not exist.
- **FR-020**: An installation holding interests from before this feature MUST be migrated such
  that every existing post still resolves to an interest, and none is orphaned.
- **FR-021**: The sub-interest roll-up — a parent's space including its children's posts — is
  **withdrawn**, and every place describing it MUST be updated rather than left describing a
  product that no longer exists.

#### Housekeeping

- **FR-022**: An interest that no post uses MUST NOT remain browsable.
- **FR-023**: Housekeeping MUST NOT remove an interest that has posts.

#### Changing nothing about what is visible

- **FR-024**: The visibility matrix MUST come out with the same surfaces and the same assertion
  count. This feature changes whose vocabulary the taxonomy is; it changes no permission.
- **FR-025**: The public and operator route snapshots MUST NOT move, except where a route genuinely
  changes, and any such change MUST be a deliberate, reviewed edit.
- **FR-026**: An empty interest space MUST NOT reveal that the visibility boundary caused it to be
  empty.

### Key Entities

- **Interest**: a word or phrase a person named, belonging to no hierarchy. Carries the name as
  typed, the form used for matching, and its state: **live, merging, merged away, or retired**.
  Retired is what an interest becomes when no post uses it — retired rather than deleted, so that a
  link to it from somewhere the boundary has not re-evaluated does not lead nowhere. (The
  implementation calls "live" `active`; the four states already exist.)
- **Interest name proposal**: what a person typed while publishing, before the product has decided
  whether it names something that exists, resembles something that exists, or is new.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person can publish a post about a subject nobody has used before, without choosing
  from any list, and find it in that subject's space afterwards.
- **SC-002**: **Zero** interests exist that a person did not create.
- **SC-003**: Names differing only by case, punctuation or spacing produce **exactly one**
  interest — counted mechanically over a generated set of variants, not sampled.
- **SC-004**: Simultaneous attempts to create the same new interest produce **exactly one**
  interest, measured under real concurrency rather than reasoned about.
- **SC-005**: The similarity check's candidate set is **every** live interest, demonstrated by a
  case that would pass a sibling-scoped check and fail a global one.
- **SC-006**: **Zero** automatic merges occur on a similarity score.
- **SC-007**: After a merge, **100%** of the source's posts and followers are reachable at the
  target, and every route to the source leads there.
- **SC-008**: After a merge, an author's own post still displays the name they typed.
- **SC-009**: **Zero** occurrences anywhere in the product — code, copy or specification — describe
  a catalogue the product owns or an interest nested under another.
- **SC-010**: After migrating an installation that predates this feature, **zero** posts resolve to
  no interest.
- **SC-011**: The visibility matrix reports the **same surface count and the same assertion count**
  as before this feature.
- **SC-012**: **Zero** interests without posts are browsable.

## Assumptions

Decisions taken where the instruction did not settle one, recorded so a reader meets them here
rather than as a surprise in the build.

- **"Like in the internet search" means normalise and suggest, not merge.** Taken from what the
  analogy does rather than from the word "merge" alone: a search engine folds case and offers "did
  you mean", and does not silently unify two distinct terms. The measurement in "Why this exists"
  is the evidence; if the owner still wants automatic merging after seeing it, FR-011 is the line
  to change, and a reversible merge would have to come first.
- **Normalisation covers case, punctuation and whitespace only.** Not stemming, not plurals, not
  transliteration. Each of those is a judgement that can be wrong — "glass" and "glasses" are not
  the same subject — and this feature deliberately stops at the transformations that cannot change
  meaning. Widening it later is a decision with its own evidence.
- **Existing installs migrate by flattening.** Every interest that has posts survives as a
  top-level interest keeping its own name; the parent/child edge is dropped rather than the child
  being folded into the parent. Folding would move somebody's post to a subject they did not
  choose, which is the same imposition this feature exists to end.
- **The twelve are deleted rather than kept as ordinary interests**, per the owner's instruction.
  On an installation where they hold posts, FR-020 governs and those posts keep their interest.
- **Operators already exist**, and merge authority rests with them. No reputation system is
  introduced; this product has none, and building one to police a taxonomy would be a larger
  feature than the taxonomy.
- **Interest colour needs no change.** A hue is derived from the interest's identity and a child
  previously borrowed its parent's; with no parents each interest simply has its own, and the
  existing exhaustive contrast check already covers the whole generated space.
- **Device verification is not available.** No emulator runs in this sandbox and nothing since
  feature 011 has run on a device. Every claim must be made at the tier that supports it, and the
  device tier reported **not run** rather than assumed.

### Open, and carried here rather than guessed

- **RESOLVED (research R7): the operator merge QUEUE is not built in this feature.** FR-012's
  capability is required and already exists; the surface that finds candidate synonyms and
  presents them for decision is out of scope. The decisive reason is that it cannot be built well
  yet — a queue must propose candidates, and the only available signal scores true synonyms
  (0.13–0.23) below every unrelated pair (0.75–0.83), so a queue ranked by it would surface
  Golf/Wolf and never NYC/New York City. Revisit when an installation has the volume, or when a
  signal better than edit distance exists.
