# Data Model: A Backend That Stays Up

**Feature**: 010 | **Date**: 2026-09-13 | **Plan**: [plan.md](./plan.md)

## What does not change, which is nearly everything

**`keys.ts` is untouched.** Every `USER#<id>`, `#PROFILE`, `MEDIA#000`, every `X#` overlay
namespace, every zero-padded sort key that carries publication order — all of it stays exactly
as written. So do the 26 access patterns in `001/data-model.md`, and the denormalised
`visibility` on index rows that lets the boundary run over query results.

This is stated first because it is the load-bearing fact of the whole feature. **The data model
is not being redesigned. The engine underneath it is being replaced.**

## The one table

```sql
create table items (
  pk      text  not null,
  sk      text  not null,
  gsi1pk  text, gsi1sk  text,
  gsi2pk  text, gsi2sk  text,
  gsi3pk  text, gsi3sk  text,
  gsi4pk  text, gsi4sk  text,
  gsi5pk  text, gsi5sk  text,
  item    jsonb not null,
  primary key (pk, sk)
);

create index items_gsi1 on items (gsi1pk, gsi1sk) where gsi1pk is not null;
-- …gsi2 through gsi5, each partial on "key is not null"
```

**Partial indexes, because a GSI is sparse.** In the old engine an item simply had no GSI key
and did not appear in that index. A partial index reproduces that exactly, and a plain index
would carry a row per item per index for items that never use them — five times the write cost
for nothing.

**The body is `jsonb`, not columns.** Repositories read and write whole items today; splitting
attributes into columns would mean touching all 29 of them, which is the remodelling R2
deliberately defers.

| Column | Holds |
|---|---|
| `pk`, `sk` | The existing key scheme, verbatim |
| `gsi1pk`…`gsi5sk` | The five index key pairs, populated exactly where the item populates them today |
| `item` | The whole item, including its key attributes, so a read returns what callers already expect |

## The seven operations

Everything the product does reaches the datastore through these. The contract in
[contracts/datastore-primitives.md](./contracts/datastore-primitives.md) fixes what each must
guarantee; this is the shape.

| Method | Becomes |
|---|---|
| `getItem` | `select item from items where pk = $1 and sk = $2` |
| `putItem` | `insert … on conflict (pk, sk) do update`, with a condition expressed as a `where` clause |
| `deleteItem` | `delete from items where pk = $1 and sk = $2` |
| `updateItem` | `update … set item = item \|\| $patch` |
| `increment` | **one** `update … set item = jsonb_set(item, …, (item->>$k)::bigint + $n)` |
| `query` | `where pk = $1 and sk like $prefix` — or the GSI columns — ordered, keyset-paginated |
| `transact` | A real `BEGIN … COMMIT` |

## Three behaviours that change, on purpose

**`increment` becomes atomic.** It is a read-modify-write today and says so in its own comment.
One statement replaces it, so two concurrent likes can no longer lose one another.

**`transact` loses its 100-item cap.** Postgres has no equivalent limit.

> **And the 20-person group cap MUST NOT move.** 005 records it as a correctness constraint
> forced by that cap — 1 meta + 2N rows, so 20 people is 41 items. The constraint disappears;
> the product decision has not been made. A task asserts the cap is unchanged, because a limit
> that quietly relaxes during a migration is indistinguishable from a bug.

**Pagination becomes keyset.** The old cursor was an opaque last-evaluated key; the new one is
`(pk, sk)` or the GSI pair. Same guarantee — a stable page boundary under concurrent writes —
by a different mechanism.

## Migration

**None, pending confirmation.** Every datastore this product has had is local or a thirty-minute
session. The spec lists confirming this under Edge Cases rather than assuming it, because if it
is wrong it is catastrophically wrong and checking costs minutes.

## What stays somewhere else

| | Where | Note |
|---|---|---|
| Photographs and video | Object storage | Never in the datastore; only keys are |
| The backend address | The device | `sih.backend.url`, from 009 |
| Credentials | The deployment environment | Never in the repository — a guard enforces it |
