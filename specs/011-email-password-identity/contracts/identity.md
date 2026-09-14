# Contract: Obtaining a credential

**Feature**: 011 | **Status**: Contract — its enforcing test exists before the
implementation it governs.

**Satisfies**: FR-001, FR-002, FR-008, FR-009, FR-010, FR-014 – FR-017, FR-023.

---

## Why this is a contract

Two of these guarantees are invisible to the obvious test. "The refusal does not reveal
whether an account exists" is satisfied *in the message* by any implementation and
*violated in the timing* by the natural one. "Two simultaneous signups produce one account"
is satisfied by a read-then-write in every sequential test and violated under the only
circumstance it exists for.

A document that fixes behaviour, with a test that measures rather than reads, is the only
form in which those two survive.

---

## 1. Sign up

Takes an email address, a password, a handle and a display name. Returns a credential and
the new person.

- MUST create the person, claim the handle and store the credential **atomically**. No
  outcome may exist in which one is written and another is not.
- MUST refuse a second account for an email already in use, and MAY say so — a person
  choosing an address has to be told.
- MUST refuse a handle already claimed, and say which field.
- MUST refuse a password below the stated floor **before** creating anything.
- MUST NOT be able to produce an operator, whatever the request contains.

> **Uniqueness is a property of the WRITE, not of a preceding read.** Under concurrency,
> exactly one of N simultaneous attempts on one address may succeed. The test drives them
> genuinely in parallel; a sequential version of it proves nothing.

> **And it is a property of the WHOLE SET, not of the rows this feature writes.** Handle
> uniqueness is enforced by a claim record; accounts predating this feature hold none, so
> the existing set is claimed in one bounded pass before any human may choose a handle. A
> constraint binding half a set does not make the set unique.

## 2. Sign in

Takes an email address and a password. Returns a credential.

- MUST succeed only for a matching address and password.
- MUST refuse with **one message, one status, and one cost** — see §4.
- MUST be rate limited by a key that does not depend on whether the account exists.

## 3. The credential

- MUST identify exactly one person, and MUST carry no more authority than the credential
  the device-token tool issues today.
- MUST survive the app closing and reopening (FR-011) — a property of where the client
  stores it, asserted from the client's side.
- MUST stop verifying once the account's epoch has advanced (FR-021, US4).
- MUST continue to verify when there is **no epoch to compare** — an account with no
  credential record, or a credential issued before the claim existed. Both absences are
  ordinary; failing closed on them breaks FR-026 and defends nothing, because an account
  with no password has nothing a reset could revoke.

## 4. Refusals are indistinguishable

> **This is the guarantee most likely to be lost, and it will be lost silently.**

For an address with no account and for an address with a wrong password, sign-in MUST
return:

- the same message,
- the same status code, and
- **in the same time**, to within a margin that does not separate the two populations.

The natural implementation — look up, return early when absent — satisfies the first two
and fails the third by two orders of magnitude, because the absent case skips a deliberately
slow key derivation. The implementation therefore derives **in both cases**.

**How this is enforced**: by measurement, repeated, comparing distributions rather than
single samples. A test asserting only the message would pass against the leaking
implementation, which is what makes it worth writing down here.

## 5. What must not change

Stated mechanically so it can be checked rather than asserted:

- `matrix.spec.ts`: the same surfaces, the same assertion total
- `surface-routing.spec.ts`: unchanged
- `auth-surface.spec.ts`: the public snapshot gains **exactly two** entries through the MVP
  (sign-up, sign-in) and **exactly four** once US4 ships (requesting a reset, completing
  one), and loses none at any point; the operator snapshot is **unchanged** throughout.
  US4's two are necessarily public — a person who cannot sign in holds no credential — and
  saying "exactly two" full stop, as this contract first did, forbids the feature it
  specifies four sections above
- every existing suite: the same tests, passing for the same reasons

> This feature adds a way to obtain a credential. If any of the above moves, it changed
> what a credential may see — which it was not asked to do. The correct response is to find
> out why, never to update the number.

## 6. The password never leaves

- MUST NOT be stored in a recoverable form.
- MUST NOT appear in any log, error, response body or diagnostic — **searched for, not
  assumed**, which is SC-008.
- MUST NOT be returned by any endpoint, to anyone, including the account's owner.
- MUST be compared in constant time.
