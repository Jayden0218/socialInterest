# Contract: naming an interest

**Feature**: 013 | **Date**: 2026-09-16

What the product promises about a name a person types. Written as a decision table because the
branches are the feature, and because a prose description of them is how one gets forgotten.

## §1 The resolution table

Given a proposed name `N` and the live catalogue:

| # | Condition | Result | Person sees |
|---|---|---|---|
| 1 | `normalise(N)` is empty | **Refuse.** Publishing fails | Why it failed, naming the rule |
| 2 | Name policy forbids `N` | **Refuse** | The existing policy message |
| 3 | `normalise(N)` equals a live interest | **Join it.** No new interest | Nothing. It is not a question |
| 4 | `normalise(N)` equals a **merged** interest | **Join its target** | Nothing |
| 5 | `N` resembles live interests, unacknowledged | **Refuse, with candidates** | Those interests, and a choice |
| 6 | `N` resembles live interests, acknowledged | **Create** | Their post published |
| 7 | Nothing resembles `N` | **Create** | Their post published |

**Row 3 is the one that delivers "merge automatically".** "Bouldering", "bouldering" and
"Bouldering!" all normalise identically, so the second and third **never create an interest** —
there is nothing to merge afterwards. Silent by design: asking somebody to confirm that
capitalisation does not matter would be noise.

**Row 5 is the sprawl control**, and its candidate set is **every live interest** (FR-008). Scoped
to a subset it returns nothing and the gate fails **open** — no error, no red test, no opinion.

## §2 Normalisation

`normalise(s) = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()`

Case, punctuation and repeated whitespace fold. **Nothing else.** Not stemming, not plurals, not
transliteration — each is a judgement that can be wrong, and wrong means filing somebody's
photograph under a subject they did not choose.

**Stated limitation**: this strips every non-ASCII character, so a name in a non-Latin script
normalises to empty and is refused by row 1. The product is Latin-script-only for interest names
today. Recorded as a limitation rather than left to be discovered.

## §3 What is guaranteed about creation

- **Exactly one interest per normalised name, ever.** Enforced by a claim row written in the same
  transaction as the interest, not by a read-then-write, and not by a per-process cache.
- **No interest without a post.** Creation happens inside the publish transaction. There is no
  moment at which an empty interest exists.
- **A failed publish creates nothing.** Same transaction, so it rolls back with the post.

## §4 What is guaranteed about merging

- **Only an operator merges.** No score merges anything (FR-011).
- **Order**: posts and followers move, *then* the source redirects. A reader never follows a
  redirect to content that has not arrived.
- **The author keeps their word.** A merge does not rewrite the name on anybody's post; the post
  displays what its author typed and reads resolve through the redirect.
- **A merge is irreversible**, and that is why none of it is automatic. There is no inverse in the
  product.

## §5 What this contract does NOT change

- No new visibility surface. An interest space is the surface it already was, decided by the same
  boundary, counted in the same matrix at the same total.
- An empty interest space **must not say why it is empty** (FR-026). Absence and refusal are
  deliberately indistinguishable, so a helpful message here would be an oracle.
- Interest follows, interest colour and the ranker's treatment of an interest are untouched.

## §6 The evidence behind §4's refusal

Measured on this repository's own `similarity`, so it can be re-run rather than believed:

| 0.91 photography/photograpy | 0.86 Running/Runing | **0.83 Baking/Biking** | **0.75 Golf/Wolf** | 0.23 NYC/New York City | 0.13 Football/Soccer |
|---|---|---|---|---|---|

The typo band and the unrelated band overlap; true synonyms sit far below both. No threshold
separates them, because edit distance measures spelling and not meaning.
