# Data Model: Disposable Session Server

**Feature**: 009 | **Date**: 2026-09-12 | **Plan**: [plan.md](./plan.md)

## The server data model does not change

No new item type. No new GSI. No new attribute on an existing item. No migration, and
nothing to backfill.

This is stated first and plainly because it is the kind of claim that is usually wrong, and
it was checked rather than assumed (research R9). A session runs `sih-main` exactly as every
other environment does — the single table, the same keys, the same access patterns described
in `specs/001-interest-media-sharing/data-model.md`. What differs between a session and a
developer's laptop is the *address* the table is reached at, which is configuration and has
never been part of the data model.

The only consequence for the table is one this feature does not control: **a session's table
starts empty.** That is a property of a fresh container, not a schema decision. It is worth
recording because it is the first environment where the product is routinely used from
empty, and the spec's edge cases require empty to work rather than merely not crash.

## New persisted state: two keys on the device

Both live behind the existing `KeyValueStore` interface in
`apps/mobile/src/data/token-store.ts`. Neither leaves the device.

| Key | Holds | Set by | Cleared by |
|---|---|---|---|
| `sih.auth.token` | The sign-in credential | Signing in | Signing out; **a change of backend address** |
| `sih.backend.url` | The backend address the app talks to | The address field on sign-in | Never cleared, only replaced |

**`sih.auth.token` already exists** and is read and written by `PersistentTokenStore`. What
changes is not the key but where it can be stored: today its only backing store is
`localStorage`, so on a device nothing persists at all (research R4). The key's name and
meaning are unchanged, which matters because `apps/e2e/browser/authenticated.spec.ts` places
a token under that exact name to authenticate the browser journeys.

**`sih.backend.url` is new.** It holds a full base address including scheme and version
prefix — the same shape as `EXPO_PUBLIC_API_BASE_URL` and the built-in default in
`config.ts`, so a value from either source is interchangeable with the other.

### Resolution order

```
stored sih.backend.url  →  if absent, the built-in default from config.ts
```

Two levels, not three. There is deliberately no environment override on top of the stored
value: an override that silently won over something a person typed into the app would make
the field lie about what the app is doing, which is the class of defect this feature exists
to remove.

### The invariant that binds them

**A credential belongs to the address it was issued by.** The two keys are not independent:
writing a different value to `sih.backend.url` clears `sih.auth.token` (FR-005, research R6).

This is enforced in one place rather than at each call site, for the same reason the product
has one `VisibilityFilter` and one `profile.projection.ts`. It is also *true* rather than
merely tidy, because every session generates its own signing secret (FR-015) — a credential
from another session would be cryptographically rejected, so there is no state in which a
stale one silently half-works.

## The Session

A session is not stored anywhere. It exists for the lifetime of one job and is described,
once, by the descriptor it emits — see
[contracts/session-descriptor.md](./contracts/session-descriptor.md).

| Attribute | Value |
|---|---|
| Backend address | Assigned at bring-up; not knowable in advance |
| Media address | Assigned at bring-up, **before the application starts** (research R3) |
| Signing secret | Generated per session; never stored in the repository |
| Credential | At least one, minted through the API's own `PersonRepository` |
| Interest catalogue | Seeded at bring-up |
| Datastore | Empty at birth |
| Lifetime | Chosen at dispatch; default 2 hours, platform ceiling 6 |
| Expiry | Bring-up time plus lifetime; stated in the descriptor |

**Sessions are independent.** Two running at once share no secret, no credential and no
data. Nothing identifies a session to a later one, and nothing carries over — which is
another way of saying there is no session entity to model, only a job that exists and then
does not.
