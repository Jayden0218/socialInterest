# 011 — guards watched RED before the code that satisfies them

A guard that has only ever passed is not a guard. This file records each one
failing first, against the product as it stood, with the output rather than a
description of the output.

It lives here and not in `specs/011-*/checklists/`, which is the spec-quality
checklist maintained by `/speckit-specify` — a verification record filed as a
requirements checklist is a record nobody reading either document expects to
find. 008 used `docs/verification/008-guard-red-log.md`; this follows it.

---

## T004 — handle uniqueness (`tests/integration/handle-uniqueness.spec.ts`)

**Run**: 2026-09-14, against the local Postgres stack with the catalogue seeded
and 16,556 existing rows. Product unmodified — nothing broken on purpose.

**Predicted by research R1**: the second create succeeds, and `findByHandle`
returns the *second* person.

**Observed**: R1's prediction held, and the concurrent case was worse than
predicted.

```
● a handle identifies exactly one person › refuses a second person with a handle already taken

  expect(received).rejects.toThrow()

  Received promise resolved instead of rejected
  Resolved to value: undefined

  > 113 |     await expect(people.create(person(handle, `probe-b-${Date.now()}`))).rejects.toThrow();

● a handle identifies exactly one person › is case-insensitive, because `findByHandle` is

  expect(received).rejects.toThrow()

  Received promise resolved instead of rejected

● a handle identifies exactly one person › admits EXACTLY ONE of eight simultaneous claims

  expect(received).toHaveLength(expected)

  Expected length: 1
  Received length: 8
  Received array:  [{"status": "fulfilled", ...} x8]

Tests:       3 failed, 235 skipped, 238 total
```

**Reading it.** `Received length: 8` is the line that matters. Not "a race
admits two occasionally" — **every one of eight simultaneous claims on one
handle succeeded, every time.** There is no race to lose here, because there is
no constraint to race for: `PersonRepository.create` guards on
`attribute_not_exists(pk)` where `pk` is `USER#<userId>`, a fresh identifier per
call, so the condition cannot fire for a handle no matter how the writes
interleave.

That distinction is worth keeping. A read-then-write would have produced an
occasional 2; this produced a reliable 8. The defect was never a race — it is
the complete absence of the constraint, and a fix that merely narrowed a window
would have looked like progress against the wrong diagnosis.

**Cost of the observation**: 20 seconds. R1's original probe cost about the same.
Both were free next to finding this after a human had chosen a handle.

---

## T006 — the measurement the back-fill is gated on

**Run**: 2026-09-14, against the same table.

```
handles: 6375
collisions: 0
```

The suffix argument — every handle in existence carries a machine-generated
suffix, so they are unique in practice — **now has a measurement behind it**
rather than being an argument. 6,375 handles, none held twice.

The script refuses to write if that number is not zero, and reports the
contested handles instead. Which account keeps a contested name is a person's
decision; a script choosing is R1's silent wrong-person outcome performed
deliberately.

## T007 — the back-fill, and its idempotence

```
claimed: 6375
already claimed: 0

(re-run)
claimed: 0
already claimed: 6375
```

Re-running costs a pass and changes nothing, which is what a back-fill has to be
able to do.

## T008 — the same guard, watched RED again with the condition removed

Green first, with the fix in place: `3 passed`.

Then `ConditionExpression: 'attribute_not_exists(pk)'` was deleted from
`HandleClaimRepository.claimItem` — **and the edit asserted itself before
running**, because this project has already recorded a break that did not apply
against a whitespace mismatch and then "passed", which proves nothing while
looking exactly like proof.

```
Received length: 8
Received length: 8
Tests:       3 failed, 235 skipped, 238 total
```

Back to `3 passed` on restore. A conditional write that has only ever succeeded
is indistinguishable from an unconditional one, and now this one has been
watched being the difference.

---

## T023 — two guards of mine, each watched failing, and ONE OF THEM PASSED FIRST

### The credential's uniqueness condition, removed

```
● sign-up under concurrency › admits EXACTLY ONE of five simultaneous sign-ups for one address
  Received length: 5
```

Five accounts for one email address. The guard catches it.

### The constant-time comparison, replaced — AND THE GUARD DID NOT NOTICE

`timingSafeEqual(derived, parsed.hash)` was replaced with
`derived.toString('base64') === parsed.hash.toString('base64')`, a comparison
that returns as soon as it finds a differing byte.

**Six assertions reported green.** The guard checked that the FILE contained
`timingSafeEqual` — and the import at the top of the file was untouched, so it
did — and that no `===` appeared in three hand-guessed spellings, none of which
matched this one.

That is the failure mode this project records as "a guard that has only ever
passed is not a guard", with the same twist as the self-defeating comment
stripper in `compiled-in-address.test.ts`: it was not too weak in an obvious
place, it was asking a question whose answer stayed true while the subject
changed underneath it.

Rewritten to look at the FUNCTION rather than the file, and to ask two questions
with no hand-picked list in them:

```ts
const body = /export async function verifyPassword[\s\S]*?\n}/.exec(code)?.[0];
expect(body).toMatch(/return\s+timingSafeEqual\(/);
expect(body).not.toContain('===');
```

Re-run against the same break:

```
● password derivation › uses a constant-time comparison, structurally
Tests:       1 failed, 5 passed
```

A hand-picked list of ways to be wrong only covers the ways somebody has already
been wrong — 004's lesson about the first version of `auth-surface.spec.ts`, in
a new place.

## T028 — the timing leak, measured

The naive implementation installed on purpose: look up, return early when the
address has no account.

```
● refuses both in the same time, compared at the median
  Expected: < 2
  Received:   45.73624704056309

● and both really did cost the key derivation
  Expected: > 20
  Received:   8.133304
```

**45.7×.** The unknown address answered in about 8ms where a wrong password
takes ~370ms, because the absent case skipped the key derivation entirely.

**The message and status assertions PASSED THROUGHOUT.** Same 401, same body
byte for byte, for both populations, with the leak wide open — which is exactly
what `contracts/identity.md` §4 says will happen and the whole reason the
guarantee needed a contract rather than a code comment. A test asserting only
the message would have signed this off.

Restored: `PASS`, ratio back under 2.

### And why the second assertion exists

The ratio alone can be satisfied by being equally FAST. Delete the derivation
entirely and both populations answer in a millisecond, the ratio is ~1, and a
ratio-only test passes over a product that never checks passwords at all. The
floor — both medians above 20ms — is what makes the ratio mean what it looks
like it means.
