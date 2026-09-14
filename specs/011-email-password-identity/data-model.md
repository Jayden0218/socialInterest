# Data Model: Email and Password Identity

**Feature**: 011 | **Date**: 2026-09-14 | **Plan**: [plan.md](./plan.md)

## What does not change

**`Person` is untouched.** Handle, display name, counts, preferences, privacy — every
field, and every surface that reads them. This feature gives a person a way to be *reached*;
it adds nothing to what a person *is*. The single table, `keys.ts`'s scheme and all 26
access patterns stay exactly as they are.

That is the load-bearing fact here, and it is what makes FR-024 achievable: the visibility
matrix cannot move, because nothing it reads has moved.

## Three new rows

All three live in the same table under the existing key scheme. None is readable by any
route.

### 1. The credential

| | |
|---|---|
| Partition | the email address, folded to lower case and trimmed |
| Sort | a fixed marker |
| Holds | `userId`, the derived password with its parameters and salt, `epoch`, `createdAt` |

**Partitioned by the EMAIL, not by the user.** The question this row answers is "who is
`jo@example.com`, and is this their password" — asked before any user id is known. Keyed by
user it would need an index to be found at all, and the uniqueness guarantee below would
have nothing to attach to.

**Uniqueness comes from the key itself**, claimed with the conditional write that already
makes `putItem` atomic. Not a lookup followed by a write: that passes every sequential test
and fails under the two simultaneous requests it exists for, which is FR-002 and SC-005.

**`epoch`** is an integer, compared during verification. A reset advances it (R4, FR-021).

### 2. The handle claim — **new, and it is a fix**

| | |
|---|---|
| Partition | the handle, folded to lower case |
| Sort | a fixed marker |
| Holds | `userId`, `claimedAt` |

**This row does not exist today and its absence is a live defect** (research R1): nothing
enforces handle uniqueness, two people can hold one handle, and `findByHandle` returns the
*second* — silently addressing the wrong person across thirteen call sites in six services.
It has never bitten because no human has ever chosen a handle.

Written in the **same transaction** as the person, so a handle cannot be claimed by an
account that failed to be created, and an account cannot exist holding a handle it did not
claim. All-or-none is what `transact` is for.

### 3. The reset request — *US4 only*

| | |
|---|---|
| Partition | an unguessable token, stored **hashed**, never in the clear |
| Sort | a fixed marker |
| Holds | `userId`, `expiresAt`, `usedAt` |

**Stored hashed for the same reason a password is.** The row is a bearer permission to take
over an account; a datastore dump that leaks it leaks every pending reset. Hashing it means
the link in somebody's inbox is the only copy of the secret that exists.

Single-use is enforced by a **conditional write** on `usedAt` being absent — not by reading
it and then writing, which is the same race in a third place.

## Where the account's own view of this lives

The person's profile gains **nothing readable**. The email address is **not** added to
`PublicProfile`, and this is worth stating rather than leaving to be noticed:
`profile.projection.ts` is the one place a `PublicProfile` is built, and adding an address
there would publish it on all seven projections at once. An address belongs to the account,
not to the person other people can see.

## Sequences, and why each is a transaction

| Operation | Writes |
|---|---|
| **Sign up** | credential row + handle claim + person row — **one transaction, all or none** |
| **Sign in** | nothing. A read and a comparison |
| **Reset request** *(US4)* | the reset row |
| **Reset completion** *(US4)* | new derived password + advanced `epoch` + the reset row marked used — **one transaction** |

Sign-up being one transaction is the whole of FR-002 and FR-003. A person created without
their handle claim leaves the handle free for somebody else; a claim written without the
person leaves a handle nobody can ever use. Either half alone is worse than failing.

## What a migration would have to do, and why there is none

Existing accounts have no credential row and no handle claim. They keep working (FR-026):
their credential was issued directly and verification does not require a credential row.

**They are not back-filled**, and a task checks rather than assumes that no two existing
handles already collide — the property holds because every handle in existence carries a
generated suffix, which is an argument, not a measurement.
