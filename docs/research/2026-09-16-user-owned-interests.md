# User-owned interests: what other products do, and what this one already has

**Date**: 2026-09-16 · **Question from the owner**: *"just share post, no need to specify
the interest — it should be created by user, and there will produce a lot of interest."*

Reading **(A)**: the taxonomy changes OWNER. Every post still carries an interest; people
create them instead of choosing from our twelve.

---

## The headline: this needs far less work than it looks, and no constitution amendment

**Principle I is silent on who owns the taxonomy.** It requires that every post is filed
under at least one interest, that interests stay first-class surfaces, and that the ranking
is inspectable. It says nothing about who creates them. Checked by reading it: the words
"curated", "catalogue" and "operator" do not appear in it.

So (A) is compatible with the constitution **as written** — no amendment, no vote. What
changes is 001's spec text about a seeded catalogue, which is an ordinary spec edit.

**And three of the four sprawl controls are already built.** This was the surprise:

| Control | Status in this repo |
|---|---|
| Users can create interests | **Built.** `POST /v1/interests`, `interest.controller.ts` |
| Exact-duplicate refusal | **Built.** `interest.service.ts:56` throws `DuplicateInterestError` |
| "Similar to these — still want a new one?" | **Built.** `acknowledgedSimilarTo`, `interest.service.ts:59` |
| Synonym → canonical merge | **Built.** The worker sets `merging`, moves posts, moves followers, then `setMergedInto` → a permanent redirect |

**The one thing that actually blocks (A) is a single required field.**
`createInterestSchema` has `parentId: z.string().min(1)` — not optional. So today a person
may only create a SUB-interest beneath one of our twelve. That is precisely the "we specify
the category" constraint being complained about, and it is one line.

---

## What four comparable products do

### 1. AO3 — the best-run folksonomy in existence, and the closest match

Users type whatever they like. A volunteer wrangler then attaches that tag to a **canonical**
tag as a **synonym**; filtering by any synonym returns the canonical and all its siblings.
Crucially, **the user's own words are never rewritten on their work** — the tag they typed
stays, and the mapping happens underneath.

Non-synonymous but related tags nest under a canonical as **subtags**, so filtering the
parent returns the children.

**Why it matters here**: that is exactly `setMergedInto` plus the existing parent/child
hierarchy. The model this repo already implements IS the AO3 model. What AO3 adds is the
ongoing human wrangling, which is a moderation cost, not code.

### 2. Stack Overflow — sprawl control by cost and by community

Three mechanisms, each aimed at a different failure:

- **A creation cost.** Tag creation started at 250 reputation, went to 500, and is now
  **1,500**. Raised twice, because the earlier thresholds did not hold the line.
- **Community synonyms.** 2,500 reputation to propose; a suggestion approved at score ≥5.
  Variants are then **silently remapped** to the primary tag on use — new users cannot
  pollute the pool by accident.
- **Culling.** Single-use tags older than six months are removed automatically.

**Why it matters here**: this product has no reputation system and should not grow one for
this. The equivalent cost is below (R4).

### 3. Reddit — the cost is naming plus obligation

A subreddit is user-created, but creating one means naming it, describing it, and moderating
it. That friction is why Reddit has communities rather than hashtags. The lesson is that
**a creation cost does not have to be reputation** — it can be an obligation.

### 4. Instagram / X — the control group

Unlimited free-form hashtags, no canonicalisation, no cost. The result is the outcome the
research literature describes as "an uncontrolled vocabulary that far exceeds the semantics
of hierarchical ontologies", and the practical outcome everyone has seen: hashtags are
decoration and discovery happens through the ranked feed instead.

**This is the failure mode Principle I's rationale already names in writing** — "a tag
nobody navigates, then a tag nobody sets, then a column nobody reads". The owner's own
constitution predicted this exact risk before the owner asked for this change.

### What the literature says

The recurring recommendation across the folksonomy work is a hybrid: **user-defined tags as
the only taxonomy, with the interface pushing people toward existing terms over novel ones.**
Formal taxonomies fail because the owner's vocabulary is not the community's; pure
folksonomies fail because retrieval collapses. The interface at the moment of creation is
where it is won or lost.

---

## Recommendations

### R1 — Make `parentId` optional. This is the change.

A person may create a top-level interest. Everything else about creation already works.

### R2 — `findSimilar` MUST become global, and this is the one that would bite silently

`catalogue.cache.ts:137` reads `this.byParent.get(parentId)` — it compares a proposed name
only against its **siblings**. Under today's model that is nearly right, because every
interest has a parent from our twelve. The moment top-level interests exist, a person
creating "Bouldering" at the top level is compared against *nothing*, and the duplicate gate
— the single most effective sprawl control in the list — **silently stops working at exactly
the moment it starts to matter.**

Nothing would fail. No test would go red. The feature would simply not do its job.

### R3 — Keep the user's word; canonicalise underneath (AO3, not Stack Overflow)

When a merge happens, the post keeps the interest the author chose and reads redirect to the
canonical. `setMergedInto` already behaves this way. Silent remapping at write time (Stack
Overflow's choice) is wrong for a product where the interest is shown ON the post: a person
would see their post filed under a word they did not type.

### R4 — The creation cost is the first post, not reputation

Do not build reputation for this. Require that creating an interest is **part of publishing
into it** — the creator's post is its first post. This is cheap, natural at the only moment
anyone wants a new interest, and it makes an empty interest unrepresentable.

That matters more than it sounds: "an interest with no posts" is the first step of the decay
Principle I describes, and this makes it impossible by construction rather than by a job
cleaning up afterwards.

### R5 — Cull what dies anyway

Stack Overflow's six-month single-use cull, on the existing job infrastructure. Merge rather
than delete where a canonical exists, so the author's posts survive.

### R6 — Autocomplete-first compose, create as the secondary action

The evidence says this is where sprawl is won. The compose screen searches as you type and
shows matches prominently; "Create <what you typed>" sits below them, not beside them. The
existing `acknowledgedSimilarTo` round-trip then catches what autocomplete missed.

### R7 — Interest colour needs no change, and that is worth checking rather than assuming

Hue is an FNV-1a hash of the interest id, with a sub-interest borrowing its parent's. A
top-level interest simply gets its own hue. The 720-colour contrast enumeration covers the
whole generated space already, so an unbounded number of user-created interests cannot
produce an illegible one.

---

## What this costs

| Work | Size |
|---|---|
| R1 optional `parentId` | one line + a migration decision for existing rows |
| R2 global `findSimilar` | small, and **load-bearing** |
| R4 create-with-first-post | moderate: publish and create become one transaction |
| R6 compose autocomplete | moderate, and it is mostly UI |
| R3, R5, R7 | already built / already correct / a job |

The heavy-looking parts — merging, redirects, moving posts and followers, the duplicate gate
— are done.

## Open questions for the owner

1. **The existing twelve.** Keep them as ordinary user-creatable interests with no special
   status, or delete them? Keeping them seeds the app with something to browse; deleting
   them is more honest about whose taxonomy it is.
2. **Does the hierarchy survive at all?** R1 permits top-level interests; it does not say
   whether people may still nest. Flat is simpler and matches hashtags; nesting keeps
   001/FR-024's roll-up, which is real navigational value.
3. **Who may merge?** AO3 has volunteer wranglers, Stack Overflow has reputation. This
   product has operators. Operator-only is the honest starting point.

## Sources

- [AO3 Tag Wrangling Guidelines](https://archiveofourown.org/wrangling_guidelines/2)
- [AO3 — Updates to "No Fandom" Additional Tags](https://archiveofourown.org/admin_posts/34531)
- [Stack Overflow — Tag Folksonomy and Tag Synonyms](https://stackoverflow.blog/2010/08/01/tag-folksonomy-and-tag-synonyms/)
- [Synonym Suggestion for Tags on Stack Overflow (Beyer & Pinzger)](https://pinzger.github.io/papers/Beyer2015-tsst.pdf)
- [Folksonomies, Crowdsourcing, and User Tagging — Synaptica](https://synaptica.com/folksonomies-crowdsourcing-and-user-tagging/)
- [A Comprehensive Review on Hashtag Recommendation](https://arxiv.org/html/2503.18669v2)
