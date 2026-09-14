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

**The existing set MUST be claimed, and the first version of this paragraph got that
wrong.** It said the claim rows are "written going forward" and that back-filling was not
licensed — conflating two different operations. *Renaming* an existing handle is indeed off
the table, and nothing here does it. *Claiming* one is not optional: the claim row is the
only thing the constraint consults, so an account that predates the feature holds a handle
with nothing defending it, and **the first human ever to choose a handle could take one
already in use.** That is R1's defect reintroduced by R1's own fix, in the window where the
feature is new.

So: one bounded pass writes a claim for every handle that exists, and it is safe precisely
because of what the paragraph got right — they carry generated suffixes and are unique in
practice. A separate task *measures* that rather than assuming it, and the back-fill runs
only if the measurement holds. If it does not, the collision is a defect to be resolved by
a person, not by a script choosing which of two accounts keeps its name.

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

**Where it lives**: on the **credential record**, which is the row partitioned by the
folded email address (data-model §1). An earlier version of this decision said "stored on
the account", which reads as the person row and is not where it is.

**AN ABSENT EPOCH VERIFIES, and this is the whole of FR-026 after US4.** Accounts created by
the device-token tool hold **no credential record at all**, so there is no epoch to read;
their credentials also carry no epoch claim, because they were issued before this claim
existed. The comparison therefore has to define both absences, and the only answer
compatible with FR-026 is that a missing epoch on either side verifies.

That is a deliberate fail-**open**, which is the opposite of what this project does for
privacy (008's `RelationshipCache.isPrivateAccount` fails closed) — so it is worth being
explicit about why the direction differs. A privacy read that fails open shows a private
post to a stranger. An epoch read that fails closed signs out every emulator journey and
the laptop runbook in one commit, and it protects nothing: an account with no credential
record has no password, so it has no reset, so it has nothing an epoch could revoke. The
epoch defends passwords, and it is inert where there is no password.

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

**Consequence**: the limit is keyed per **client IP** — written that way because "address"
means the *email* address everywhere else in this feature, and a reader who carries that
meaning into this paragraph concludes the bucket is per-account, which is the one thing it
must not be. An IP key cannot depend on whether the account exists, which is exactly what
FR-010 requires and is why it needs no new mechanism. Everybody behind one NAT shares a
bucket; that is accepted, and the capacity is chosen with it in mind.

---

## R8 — Why the cold start still fits

**Finding**: 007/FR-014 asks about interests once per **account**, tracked by
`seeds.asked(userId)`, and a newly created account has answered nothing.

**Decision**: account creation lands on the cold start, exactly as the device-token path
does today. No change is needed — which is stated here because "no change needed" is a
claim, and the reason it holds is that the cold start was already keyed to the account
rather than to the device.

---

## R9 — US4 NEEDS TWO PUBLIC ROUTES, and FR-023's first version forbade them

**Finding**: the spec as first written said sign-up and sign-in were "the only routes this
feature makes reachable without a credential", and SC-007 pinned the public snapshot at
**exactly two**. Password reset cannot be built under that: a person who has forgotten
their password holds no credential, so requesting a reset and completing one are reachable
by that person or by nobody.

Caught by the analysis pass rather than by Phase 6, which is where it would otherwise have
surfaced — as `auth-surface.spec.ts` going red on a snapshot the spec said must not move,
with the spec and the test agreeing with each other and both being wrong.

**Decision**: four public routes in total, two per releasable slice, and the count is
stated per slice rather than as one number. FR-023 and SC-007 now say so, and Phase 6 has
the controller task it was missing entirely — the reset row, the identical response and the
single-use condition were all specified with nothing to call them.

**Alternatives rejected**: a reset flow behind the expired credential the person still
holds (they may hold none — a new device, a cleared app); emailing a new password instead
of a link (mails a secret in the clear and needs no route, which is worse for the reason
data-model gives about storing the token hashed).
