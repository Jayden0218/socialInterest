# Quickstart: proving 009 works

**Feature**: 009 | **Date**: 2026-09-12 | **Plan**: [plan.md](./plan.md)

How to validate this feature end to end, and what each step proves. Written for the owner,
who will be doing most of it on a phone.

Nothing here provisions anything, and nothing here costs anything.

---

## Prerequisites

- The repository is **public** (GitHub-hosted runners are free on it). Checked, 2026-09-07.
- A phone with the app installed. **One build is enough, forever** — that is the point of
  US1. If you have one from a previous session, keep it.
- No cloud account. No payment method. If a step asks for either, the feature has failed
  FR-009 and the step is wrong.

---

## A. The address change, without any session at all

US1 is independently testable and worth validating first, because if it does not work
nothing downstream can be reached.

```bash
pnpm --filter @sih/mobile test          # the store, the container, the guards
pnpm --filter @sih/e2e test:browser -- signin-fit    # the fold, with two fields
pnpm lint && pnpm typecheck
```

Then on the phone, with **no session running**:

| Step | Expect | Proves |
|---|---|---|
| Open a freshly installed app | A built-in default address is shown and can be edited | FR-003 |
| Type an address, sign in, force-quit, reopen | Still pointed at that address, still signed in | FR-002, and the device store that never existed (R4) |
| Change the address to a different one | Asked to sign in again | FR-005 |
| Re-enter the **same** address | Still signed in — not signed out for retyping | Contract §3, second clause |
| Point it at an address nothing serves | A stated error, not an empty feed | FR-004 |
| With the keyboard open, both fields filled | The submit control is reachable without scrolling | FR-006 |

> The last row is the one to do carefully. It has cost three device runs, and it cannot be
> checked in a browser — react-native-web has no soft keyboard.

---

## B. Start a session

From the repository's Actions tab, dispatch **Session server**. Choose a lifetime, or take
the 2-hour default.

Wait. Expect a descriptor in the **run summary** — not buried in the log — carrying:

- a backend address
- a **different** media address
- an absolute expiry time, and the lifetime you chose

**NOT a credential** (amended 2026-09-16, FR-014). It used to print one, because the product
had no self-service sign-up; 011 added it, so the descriptor's reason for carrying a live
credential into a world-readable job summary went away. You create an account in the app
instead — the datastore is fresh, so the name you want is free.

If bring-up fails instead, the summary must name **which step** failed. A failure that does
not name a step is a defect in this feature, not in whatever failed (FR-021).

**What this proves**: FR-008 through FR-017 and FR-020.

> **The first dispatch is an experiment, not a validation.** Research R2 records the tunnel
> as unverified on a runner. If it fails there, that is the expected-and-planned-for outcome,
> not a surprise — fall back to the providers R2 names, in order.

---

## C. Use it from the phone

On mobile data, or any network unrelated to anything:

| Step | Expect | Proves |
|---|---|---|
| Enter the backend address, then create an account | Signed in | FR-010, FR-011, FR-014 |
| Look at the feed | The seeded content is there | FR-013 |
| Publish a post with a photograph | It publishes | — |
| Look at it | **The photograph renders** | SC-004, and contract §1 |
| Open the safety sheet on a post and file a report | It is accepted | FR-018, Constitution IV |

> **The photograph is the whole test.** It is the only step that exercises presigned upload,
> the media pipeline, and presigned read-back — which is every piece the bring-up order can
> get wrong. A blank image here means step 3 ran before step 2, and means the bring-up's own
> check did not catch it.

---

## D. Let it end

Leave it. At the stated expiry, the session ends on its own (FR-016) and SC-005 allows five
minutes of slack. The app should then report that it cannot reach the backend — **not** show
an empty feed (FR-004 again, on the path where it is most likely to be got wrong).

---

## E. Do it again tomorrow

Dispatch a second session. Put its address into the **same installed app**.

Three different addresses across three days, one install, no rebuild — that is **SC-002**,
and it is the criterion that says the feature actually removed the problem rather than moving
it.

---

## What must still be true afterwards

Run these and expect them **unchanged**. This feature adds no surface and relaxes no rule;
these are the gates that say so mechanically rather than on my word.

```bash
pnpm --filter @sih/api test:visibility   # BASE_SURFACES 16, baseTotal 1488 — unchanged
pnpm --filter @sih/api test:integration  # auth-surface public-route snapshot — unchanged
```

If either moves, the design is wrong — see [plan.md](./plan.md)'s Constitution Check.

---

## Recording the result

Copy the result into `docs/verification/runs/` as a dated record, and add the divergence
entry a session requires under Principle V. Mark every criterion pass, fail, or **not run** —
never blank.

Two things must be reported honestly rather than rounded up:

- **A session is not a deployment.** It does not answer the open hosting question or the
  pending datastore decision. The spec's Out of Scope says so; the record should too.
- **Count what you counted.** If you report "N of M", count the rows — this project has
  recorded miscounting the denominator twice, from reading the highest number instead of
  counting the items.
