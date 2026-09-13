# Contract: The Seven Datastore Primitives

**Feature**: 010 | **Status**: Contract — its enforcing test exists before the implementation it
governs (Constitution, *Development Workflow and Quality Gates*).

**Satisfies**: FR-001, FR-003, FR-004, FR-005, FR-006.

---

## Why this is a contract

Twenty-nine repositories depend on seven methods. Every read path in the product — and therefore
every visibility decision — runs through them. A subtle difference in any one is a defect in all
twenty-nine at once, and the most dangerous kind: **the totals still pass while an answer
quietly changes.**

So this document fixes behaviour, not implementation. The same tests must pass against the old
engine and the new one; that is the point, and it is how the migration is proven rather than
hoped.

---

## 1. `getItem(pk, sk)`

MUST return the item exactly as stored, or `null`. MUST NOT throw when absent — absence is an
answer the product acts on, not an error.

## 2. `putItem(item, condition?)`

MUST write the whole item. With a condition, MUST apply **atomically**: either the condition
held and the write happened, or neither.

> The condition in use is "this item does not already exist", which makes uniqueness work. A
> read-then-write would pass every test and fail under two simultaneous requests — which is the
> only circumstance it exists for.

## 3. `deleteItem(pk, sk)`

MUST remove it. Deleting something absent MUST succeed — callers rely on delete being idempotent.

## 4. `updateItem(key, patch)`

MUST merge, never replace. Attributes not named MUST survive untouched.

> Replacing rather than merging would silently drop fields, and a test asserting only the field
> it set would pass. This is the shape of 008's `avatarUrl` defect, which survived in seven of
> nine places because the test looked only where the author was already looking.

## 5. `increment(key, attribute, by)`

MUST be atomic. Two concurrent increments MUST both be reflected.

> **This is a behaviour change and an improvement.** The current implementation is a
> read-modify-write and says so in its own comment, so concurrent likes could lose one another.
> The contract now requires what the documentation always claimed.

## 6. `query(partitionKey, options)`

MUST return only items in that partition — or, on an index, only items that populate that index.
MUST order by sort key. MUST paginate with a cursor that is stable under concurrent writes.

> **A sparse index must stay sparse.** An item that does not populate an index key MUST NOT
> appear in that index. Getting this wrong widens what a query returns — and a query that
> returns *more* than it should is precisely the input the visibility boundary is protecting
> against. The matrix would still pass, because it asserts the boundary's decisions, not the
> candidate set handed to it.

## 7. `transact(items)`

MUST apply all or none.

> No item-count cap is required. **The 20-person group cap stays where it is anyway** — see
> `data-model.md`. A migration may remove a constraint; it may not make a product decision.

---

## What MUST NOT change

Stated mechanically so it can be checked rather than asserted:

- `matrix.spec.ts`: **16 surfaces, 1,488 assertions**, unchanged
- `surface-routing.spec.ts`: unchanged
- `auth-surface.spec.ts`: the public and operator route snapshots, unchanged
- Every existing suite: the same tests, passing for the same reasons

> If any of those move, the migration changed behaviour. The correct response is to find out
> why — never to update the number.

---

## How this contract is enforced

**The same test file runs against both engines** where both can still be started, and against
the new one thereafter. A primitive whose behaviour is only ever exercised through a repository
is a primitive whose contract nobody checked.

**And each guarantee is verified by breaking it.** A guard that has only ever passed is not a
guard — this project has recorded that lesson often enough to stop restating it. At minimum:
`putItem`'s condition under concurrency, `increment` under concurrency, `updateItem` dropping an
unnamed field, and a sparse index returning an item that does not populate it.
