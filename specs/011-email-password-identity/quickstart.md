# Quickstart: proving 011 works

**Feature**: 011 | **Date**: 2026-09-14 | **Plan**: [plan.md](./plan.md)

Two of these checks cannot be done by reading, and they are the two that matter.

---

## Phase A — sign up and sign in (US1, US2)

```bash
pnpm doctor                       # the machine can reach the datastore and storage
pnpm laptop                       # tab 1
```

Then the gate, which is most of Phase A's verification:

```bash
pnpm --filter @sih/api test       # unit, contract, visibility, integration
pnpm lint && pnpm typecheck
```

| Expect | Proves |
|---|---|
| The visibility matrix reports the **same surfaces and the same total** | FR-024 — nothing about what a credential may see moved |
| The public route snapshot gains **exactly two** entries | FR-023, SC-007 |
| The operator snapshot is **unchanged** | FR-025 — signing up cannot make an operator |
| Every existing suite green, for the same reasons | FR-026 — device-token accounts still work |

> **If a visibility number moved, stop.** This feature adds a way to obtain a credential. A
> moved number means it did something else, and updating the number to match is how a
> behaviour change ships inside a passing suite.

### The two that cannot be read

**Concurrency.** Drive N simultaneous sign-ups for one address and count the accounts. One.
A sequential version of this test passes against a read-then-write and proves nothing —
which is the whole reason SC-005 says "under genuine concurrency".

**Timing.** Measure sign-in refusals for an address with no account and for an address with
a wrong password, repeatedly, and compare the distributions. They must not separate. A test
that only compares the messages passes against the leaking implementation.

### And the thing no test substitutes for

```bash
pnpm mint:token   # NOT needed any more — but it must still work
```

Create an account through the app, sign out, sign in again, and find the same profile with
the same posts. Then confirm `pnpm mint:token` still produces a usable credential, because the
emulator journeys and the laptop runbook both depend on it (FR-026).

---

## Phase B — staying signed in (US3)

On a device, not in a browser:

1. Sign in. Force-stop the app. Reopen it. **You are still signed in and were asked
   nothing** (SC-003).
2. Sign out. Reopen. **You are asked to sign in.**
3. Make the stored credential invalid, then open the app. **You land on sign-in with an
   explanation**, not on an empty feed (FR-013).

Step 3 is the one that gets skipped and is the one people actually hit.

---

## Phase C — password reset (US4)

Releasable on its own, and not before a real message has been delivered to a real inbox.

1. Request a reset for an address with an account → an email arrives.
2. Request one for an address without → **the same response, and no email**.
3. Follow the link, set a new password → the old one stops working.
4. Follow the same link again → refused.
5. Let one expire → refused, with an invitation to request another.
6. **A credential obtained before the reset stops working** (FR-021). This is the step that
   makes a reset mean something; without it a reset leaves an attacker's session alive.

> Until this phase ships, the app must not show a control that appears to offer it
> (FR-022). A "Forgot password?" link leading nowhere is the declared-half-with-no-other-half
> shape this project has recorded seven times.

---

## What this quickstart does not close

- **A real device.** Everything above except Phase B can run against a browser or a test
  harness; SC-001 and SC-003 are claims about a phone. The emulator job is where they are
  settled.
- **Native font scaling** on the new screens — unmeasurable in a browser, unchanged as a
  gap since 006.
- **Real usage.** Nobody has created an account who did not build the product.
