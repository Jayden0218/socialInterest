# Research: Email and Password Identity

**Feature**: 011 | **Date**: 2026-09-14 | **Plan**: [plan.md](./plan.md)

---

## R1 — HANDLES ARE NOT UNIQUE, and this feature is the first thing that makes that matter

**Finding**: `PersonRepository.create` guards with `attribute_not_exists(pk)`, and `pk` is
`USER#<userId>` — a fresh identifier every time. **The condition can never fire for a
handle.** Nothing else enforces uniqueness either; `findByHandle` is a lookup, not a
constraint.

**Proved rather than read.** Two people were created with the same handle against the real
datastore:

```
SECOND CREATE SUCCEEDED — handles are NOT unique
findByHandle returns: probe-b-1789347204215
```

Note *which* one came back: the **second**. So a duplicate does not merely exist, it
**shadows** the original — `GET /v1/people/{handle}`, a mention, opening a conversation
"with jo", following, blocking and reporting all resolve through `findByHandle` across
**six services and thirteen call sites**, and every one of them would silently address the
wrong person.

**Why it has never bitten**: no human has ever chosen a handle. Every handle in existence
was machine-generated with a unique suffix — `createProfile` appends eight characters of
the user id, `mint-device-token` appends eight more. The defect is real and latent, and
US1 is precisely the change that removes the thing hiding it.

**Decision**: uniqueness is **established**, not preserved, and it is a **prerequisite of
US1 rather than a consequence of it**. The spec's FR-003 says "remain unique, under the
same guarantee they have today" — that wording was written believing a guarantee existed.
It must be read as *establish*, and the plan sequences it first.

**Mechanism**: a dedicated uniqueness row keyed by the handle, claimed in the **same
transaction** that writes the person. Not a read-then-write: that passes every sequential
test and fails under exactly the two simultaneous requests it exists for — the same
argument the datastore contract already makes about `putItem`'s condition, and the same one
that makes email uniqueness work below. One mechanism, two claims, written together.

**Alternatives rejected**:

| | Why not |
|---|---|
| Check `findByHandle` before creating | A read-then-write. Two signups a millisecond apart both see "free" and both succeed |
| A unique index on the handle column | The datastore is a single table of `jsonb` rows; handles live inside `item`, and adding a column-level constraint for one field re-opens the remodelling 010/R2 defers |
| Leave it, and make handles server-generated | Removes the defect by removing the feature. A person choosing their own handle is the point |

**What this does NOT license**: back-filling or renaming any existing handle. They are
unique in practice because they carry generated suffixes; the claim rows are written going
forward, and a task verifies that no existing pair collides rather than assuming it.

---

## R2 — Password hashing: `scrypt`, from Node's own `crypto`

**Decision**: `scrypt`, with a per-password random salt, parameters stored alongside the
hash, compared with `timingSafeEqual`.

**Rationale**: it is in the standard library. Argon2id is the better algorithm on paper and
every implementation for Node is a native addon — a compile step in CI, on a laptop, and in
whatever container this eventually runs in, for a product with one user. `scrypt` is
memory-hard, is what Node ships, and needs no build toolchain.

**Storing the parameters with the hash** is what makes the choice reversible: a record that
says how it was derived can be re-derived differently later, and one that does not is a
decision that has to be made correctly on the first day.

**Alternatives rejected**: `bcrypt` (native addon, and a 72-byte input truncation that
surprises people); `pbkdf2` (in the standard library, but not memory-hard); a plain hash
with a salt (not a password KDF at all).

---

## R3 — Timing equivalence is a REQUIREMENT, not a side effect

**Decision**: sign-in performs the password derivation **whether or not the address
exists**, against a fixed dummy hash when it does not, and returns one message.

**Rationale**: FR-009 asks for a refusal that does not reveal whether an account exists.
The obvious implementation — look up, return early if absent — satisfies the *message* and
gives the answer away in the *timing*: an absent address answers in a millisecond, a wrong
password answers after a deliberately slow KDF. That is not a subtle leak; it is the
difference between one millisecond and a hundred, measurable over a phone network.

This is why SC-004 measures elapsed time rather than trusting the message, and why the
spec's first version of FR-009 was corrected before the checklist was ticked.

**Alternatives rejected**: a random delay (adds noise, not equivalence — the distributions
still separate under repetition); constant-time only in the message (the case above).

---

## R4 — One credential, and a reset must be able to end the ones outstanding

**Decision**: keep the existing bearer credential. Add a per-account **credential epoch**,
carried in the credential and stored on the account; a reset advances it and every
credential issued before it stops verifying.

**Rationale**: the spec accepts one long-lived credential rather than access-plus-refresh
(Assumptions), and FR-021 is the price of that acceptance: a reset is what somebody does
when they believe they are compromised, and a reset that leaves the attacker's session
alive solves nothing.

An epoch is one integer compared during verification. The alternative — a revocation list —
needs storage, expiry and a read on every request, to express something a counter already
expresses.

**Consequence worth naming**: verification gains a datastore read it did not have. That is
a real cost on the hottest path in the product, and the plan measures it rather than
assuming it is free.

**Alternatives rejected**: short access tokens with refresh (a second mechanism serving a
requirement nobody has stated); doing nothing and accepting that a reset is cosmetic.

---

## R5 — The identity provider stays; it gains a second responsibility

**Decision**: `LocalIdentityProvider` continues to be the only implementation. It gains
issuing-for-a-person beside verifying, and `issueForTesting` stays what it is — a test
affordance, named so nobody mistakes it for the product path.

**Rationale**: a managed identity service would mean the product verifies its tokens in
production and local ones in tests. That is two implementations selected by configuration,
which is the shape the four AWS adapters were deleted for — "four untested implementations
selected by an env var is how a defect hides" — and every test would exercise the one that
does not ship. Constitution V applies to the choice, not just to the adapters.

**Alternatives rejected**: Supabase Auth (free, and would hand us reset email for nothing —
rejected on the above, and the email saving is what R6 buys separately); Cognito (gone with
AWS on 2026-09-05).

---

## R6 — Email delivery is a PORT, and it is unbound until US4

**Decision**: define a mail port with no adapter bound until US4 ships. US1–US3 do not
import it.

**Rationale**: this is the "extract a port" move CLAUDE.md recommends reaching for before
editing shared code, and it keeps the outside service at arm's length. Brevo is the
intended provider — 300 messages a day, free, no card, matching the owner's standing
constraint — but nothing in US1–US3 should know that.

**The trap this avoids**: defining the port now and binding a do-nothing adapter to it
"for later" would produce a reset flow that silently succeeds and sends nothing. That is
the declared-half-with-no-other-half shape this project has recorded seven times, and it is
why FR-022 forbids showing the control before the thing behind it exists.

**Divergence**: a mail adapter is, by definition, something no local test exercises for
real. It is registered under Principle V when US4 lands, with a stated plan to verify a
real delivery before it is offered to anybody.

---

## R7 — Rate limiting works unchanged, and the reason is worth checking

**Finding**: `RateLimitGuard` keys its bucket on `req.viewer?.userId ?? req.ip ??
'anonymous'`. On a public route there is no viewer, so it falls back to the address — which
is exactly the right key for sign-in, and it means FR-010 needs the existing decorator and
nothing else.

**Checked rather than assumed**, because the guard was written for authenticated routes
(publishing, commenting, sub-interest creation) and a viewer-only key would have bucketed
every failed sign-in in the world together under `'anonymous'`.

**Consequence**: the limit is per-address and does not depend on whether the account
exists, which is what FR-010 requires. Everybody behind one NAT shares a bucket; that is
accepted, and the capacity is chosen with it in mind.

---

## R8 — Why the cold start still fits

**Finding**: 007/FR-014 asks about interests once per **account**, tracked by
`seeds.asked(userId)`, and a newly created account has answered nothing.

**Decision**: account creation lands on the cold start, exactly as the device-token path
does today. No change is needed — which is stated here because "no change needed" is a
claim, and the reason it holds is that the cold start was already keyed to the account
rather than to the device.
