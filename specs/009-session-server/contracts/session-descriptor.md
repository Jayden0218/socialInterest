# Contract: The Session Descriptor

**Feature**: 009 | **Status**: Contract — the test that enforces it is written before the
code it governs (Constitution, *Development Workflow and Quality Gates*).

**Satisfies**: FR-008, FR-010 through FR-014, FR-016, FR-017, FR-020, FR-021, FR-022.

---

## What this contract is about

A session is useless unless the owner can (a) reach it and (b) prove who they are to it. This
document fixes what a session must produce, **in what order it must produce it**, and where
it must put it. It is a contract rather than a README because getting one clause wrong — the
ordering one — produces a session that looks like it works and is not, and this project has
already paid for that twice.

The contract is written against **addresses**, never against a particular tunnel provider.
Research R2 records the chosen provider as unverified with named fallbacks; swapping it must
change one script and nothing in this document.

---

## 1. The bring-up order is fixed

```
1. backing services up, and proven ready
2. create the table and bucket, and seed the interest catalogue
3. media tunnel up       → capture MEDIA ADDRESS
4. START THE APPLICATION, with its public media address set to MEDIA ADDRESS
5. application tunnel up → capture BACKEND ADDRESS
6. mint at least one credential
7. verify the media address actually took (below)
8. emit the descriptor
```

**Step 4 may not precede step 3.** This is the clause the whole document exists for.

**Step 2 may not follow step 4 either, and that was a correction made while
implementing this.** The first version of this contract seeded the catalogue
AFTER the application started, which reads fine and is wrong: the catalogue is
loaded into an in-memory cache by `onModuleInit`, so an application started
against an empty table holds an empty catalogue and nothing can be posted to.
`android-emulator.yml` has always seeded first, and the order there is the tested
one. A sequence that looks reasonable is not evidence; the sequence that has run
is.

The application signs every media URL it issues against the address a client will use, and
**a presigned signature covers the host** — so a URL signed against the wrong address cannot
be repaired afterwards by rewriting it. The media address must therefore be known before the
application starts, and a tunnel address is not known until the tunnel is up.

### The check that enforces it

A bring-up MUST verify, before emitting a descriptor, that a media URL issued by the running
application is addressed to MEDIA ADDRESS. A bring-up that cannot verify this MUST fail and
name this step. It MUST NOT emit a descriptor.

> **Why a check and not a comment.** The failure mode is a session that serves the whole
> product correctly with **every image blank**. That reads as a defect in the product and is
> not one — it is a setup fault, and the person debugging it will look in the wrong place.
> Run 13 created three upload targets and published nothing because the bytes never landed.
> Run 25's third defect is the same fact from the other side. A session that has not proven
> this clause is not a session.

---

## 2. What a descriptor MUST contain

| Field | Requirement |
|---|---|
| Backend address | The address the app talks to. Full base address including scheme and version prefix, interchangeable with the app's built-in default |
| Media address | The address media is served from. Distinct from the backend address |
| Credential | At least one, valid for **this** session only |
| Expiry | An absolute time, not a duration. "2 hours" read forty minutes later is a lie |
| Lifetime as chosen | So the owner can see that the dispatch input took effect (FR-017) |

**The credential MUST be one the product itself would accept.** The local profile has no
self-service sign-up, so a correctly-signed credential whose profile row does not exist gets
`404 No such person` and sign-in fails on the device. A descriptor carrying such a credential
satisfies this contract's letter and fails its purpose; the credential MUST be minted through
the application's own person repository, as `apps/api/scripts/mint-device-token.ts` does.

**Both addresses MUST be reachable over an encrypted connection (FR-011), and the bring-up
MUST verify it rather than assume it.**

The chosen provider gives this for free, because its edge terminates TLS — which is exactly
why it needs a check. A property that holds by accident stops holding silently when the thing
it depends on is swapped, and research R2 names three fallback providers that are **not**
equivalent on this point: a self-hosted tunnel can serve plaintext perfectly happily.

A bring-up MUST fail, and name this clause, if either captured address is not encrypted.

---

## 3. Where a descriptor MUST be written

**To the job's rendered summary, in full, at the moment it is known.**

MUST NOT be *only* in the job log. MUST NOT be *only* in an uploaded artifact.

> **Why this is a MUST.** Job logs are returned as a **tail**; an artifact sits on a blob host
> this project's environment denies with a 403. Run 40's evidence was printed where neither
> could reach it and that run is recorded as *cause unknown* rather than diagnosed. Run 56
> printed its evidence after a loop that was killed before the loop finished, so it printed
> nothing at all — for the first failure it existed for.
>
> The owner reads this **on a phone**, which makes every one of those failure modes worse.

A descriptor MUST be emitted at the moment its contents are known, not accumulated and
printed at the end of the job. A session that ends unexpectedly must still have told the
owner how to reach it while it was alive.

---

## 4. Failure MUST name the step

If bring-up fails at any numbered step above, the result MUST name **that step**.

A bring-up that fails without naming a step is a defect in this feature, not in whatever
failed. This is stated as a requirement (FR-021) because the alternative is the six-emulator-run
failure again: iterating on a failure nobody could observe, where the fix arrived in the same
execution as the first observation.

---

## 5. A running session MUST be observable

While alive, a session MUST let the owner determine that it is still alive and how much
lifetime remains (FR-022). The product already serves a public health endpoint reporting its
status, profile and catalogue size; nothing new is required to satisfy this, and nothing new
SHOULD be added.

---

## 6. What a session MUST NOT do

Stated here so that a future change to the bring-up cannot quietly cross these lines.

- MUST NOT make any route public that is not already public.
- MUST NOT relax, bypass or reconfigure any visibility, authentication or privacy rule.
- MUST NOT disable or omit any safety surface.
- MUST NOT seed content beyond the interest catalogue the product needs to function.
  Seeding a populated feed would hide the case where the product is used from empty, which
  the spec's edge cases require to work.
- MUST NOT reuse a signing secret from another session, or any secret stored in this
  repository.
- MUST NOT be described, in any document this feature produces, as a deployment of the
  product or as available to the public (FR-019).

> These are the mechanical form of research R10. The gates in [plan.md](../plan.md) check the
> first three: the visibility matrix totals and the public-route snapshot must both be
> unchanged when this feature lands.
