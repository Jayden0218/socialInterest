# Datastore Decision (003/US3, T017–T021)

**Date**: 2026-09-06 | **Revisits**: 001/research.md D3, in light of D9 and the removal of AWS

## Why this is being revisited

D3 recorded that **PostgreSQL fitted this specification better** and that DynamoDB was the
owner's instruction. That instruction pointed at AWS. AWS was dropped as a deployment target on
2026-09-05 and its four adapters deleted, so the reason for the choice is weaker than when it
was made.

D9 then decided the datastore gets **no adapter**, on the sound reasoning that DynamoDB Local
speaks the same API so no abstraction was warranted. The consequence is that this choice is
welded into the persistence layer, and the cost of changing it only grows.

## Migration cost — counted, not estimated

The surface is **narrower than "14 repository classes"**, because the repositories are thin.

| What | Size | What a change costs |
|---|---|---|
| `base.repository.ts` | 136 lines | **All of it.** Every DynamoDB call lives here: `getItem`, `putItem`, `deleteItem`, `increment`, `query`, `transact`. This is the real port |
| `keys.ts` | 104 lines | **All of it.** The single-table key design — `USER#<id>` / `#PROFILE` and friends |
| `cursor.ts` | 23 lines | Pagination token encoding; opaque either way, but its contents change |
| 13 concrete repositories | 715 lines total | **Mostly mechanical.** They call base methods with keys. But semantics ride on key structure — `ReactionRepository` enforces one-reaction-per-person *by the key itself*, with no application check, and that guarantee must be re-established |
| 4 transaction call sites | `post.transaction.ts`, `post-update.transaction.ts`, `block.service.ts`, `reaction.service.ts` | **Genuinely DynamoDB-shaped.** They build `TransactItems` directly. FR-017 depends on these being atomic |
| `infra/scripts/create-local-table.ts` | — | Replaced by schema creation |
| `data-model.md` | 20 access patterns | Re-expressed |

**Honest total**: roughly **265 lines of core persistence** rewritten, 4 transaction sites
reworked, 13 repositories mechanically adjusted, plus schema and documentation. Days, not weeks
— and materially cheaper than it looked before counting.

## Can each option run as itself outside a deployment?

This is the criterion that decides whether 003/US5 has an answer at all.

| Option | Local form | Runs as itself? | Consequence |
|---|---|---|---|
| **DynamoDB** | DynamoDB Local | **No — a stand-in.** Amazon ships it for testing | Load measurement is impossible without spend. Measured ceiling **827 req/s**, against an application shape of 5,574 — every local figure measures the emulator. This is exactly why 002/SC-002 had to be withdrawn |
| **PostgreSQL** | PostgreSQL | **Yes — the same software** | Load measurement is possible in a container, at no cost, and means something |

## Recommendation

**PostgreSQL**, on three grounds that are now evidenced rather than aesthetic:

1. **It is the only option under which US5 is answerable.** Under DynamoDB, "what does this do
   under load" cannot be asked without spending, permanently.
2. **The original reason for DynamoDB has gone.** It pointed at AWS. There is no AWS.
3. **D3 already judged it the better fit** — fuzzy interest search, merges and aggregation are
   the friction D3 deliberately concentrated behind `CatalogueSearch` and one async job
   precisely because DynamoDB made them awkward.

Against it: the single-table design and its 20 access patterns are built, tested and green, and
this is sunk cost being written off. That is a real objection and the counted figures above are
what it should be weighed against.

## Decision

**Deferred to the owner. Not made here.**

DynamoDB was the owner's explicit instruction. Reversing it is an architectural choice about
their product, not a verification task, and 003/T021 says that if the decision differs from what
is implemented the migration is sized and **stopped** rather than begun inside this feature.

| Field | Value |
|---|---|
| options | DynamoDB (incumbent) · PostgreSQL |
| migration_cost | ~265 lines core persistence + 4 transaction sites + 13 thin repositories + schema + docs |
| runs_as_itself_locally | DynamoDB **no** · PostgreSQL **yes** |
| decision | **Pending — owner** |
| decided_by | — |

**What this means for the rest of 003**: US2 (durability) proceeds on the incumbent, because
persisting the datastore is a one-line compose change that is not wasted either way. **US5
proceeds only as far as the incumbent allows**, which is to say it will report a measurement of
a stand-in and say so, per FR-013 — unless this decision changes first.
