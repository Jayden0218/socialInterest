# Contract: The Backend Address on the Device

**Feature**: 009 | **Status**: Contract — the test that enforces it is written before the
code it governs.

**Satisfies**: FR-001 through FR-007.

---

## What this contract is about

The app has always talked to exactly one address, fixed when it was built. This contract
makes the address a value a person can change, and fixes the three things that get subtly
wrong when you do: where it is resolved from, what happens to the credential when it changes,
and what the address is **not** allowed to mean.

---

## 1. Resolution

```
stored address  →  if absent, the built-in default
```

Two levels, and deliberately not three. A stored value MUST win over anything else. There
MUST NOT be an environment or build-time override that beats a value a person typed into the
app: an override that silently wins would make the field lie about where the app is pointing,
which is the exact class of defect this feature exists to remove.

The built-in default MUST remain present and MUST remain replaceable (FR-003). An app with
nothing stored MUST still work against its default rather than failing obscurely.

## 2. Persistence

A stored address MUST survive the app being closed and reopened (FR-002).

> **This is not free today.** The interface it will use has exactly one implementation, and
> that implementation works only in a browser — so on a device nothing persists at all and
> the app already signs out on every relaunch. Satisfying this clause means building the
> missing half. See research R4; it is a pre-existing defect that this contract forces into
> the open rather than one this feature introduces.

A storage failure MUST NOT break the app. Reading MUST fall back to the built-in default and
writing MUST leave the in-memory value intact for the current run — the behaviour
`PersistentTokenStore` already implements for the credential, where a failed read answers
"signed out" rather than throwing and breaking every request.

## 3. Changing the address discards the credential

Writing an address different from the stored one MUST clear the stored credential (FR-005).

This MUST happen in **one place**. A rule applied at two call sites is a rule that will be
applied at one of them.

> **Why.** A credential is issued by one session and is meaningless to any other — each
> generates its own signing secret, so the token will be rejected. Keeping it produces the
> worst available state: the app believes it is signed in, every request fails, and the person
> sees a product that appears broken instead of a sign-in screen.

Writing the **same** address again MUST NOT clear the credential. Re-entering an unchanged
value is not a change, and treating it as one would sign a person out for retyping what was
already there.

## 4. Failure is reported, never rendered as emptiness

When the configured address cannot be reached, or rejects the credential, the app MUST say so
(FR-004). It MUST NOT present the failure as an absence of content.

> **Why this is a contract clause and not a nicety.** This project has shipped the confusion
> in both directions: a candidate row rendered as an empty post five separate times, and a
> failed load rendering as an empty state is named in `002` as one of the specific things a
> browser journey was introduced to catch. "No posts yet" and "cannot reach the server" look
> identical to a person and mean opposite things.

## 5. The submit control stays above the fields

On the sign-in surface, the control that submits the address and the credential MUST remain
reachable while the on-screen keyboard is open (FR-006).

**This is satisfied by ordering, not by measurement.** A control placed above the fields
cannot be covered by a keyboard that opens below them — at any keyboard height, under
`adjustResize` and `adjustPan` alike.

> **Why it is stated as an invariant.** Runs 39, 40 and 41 each spent about twenty minutes
> signed out because this control sat below the fold with the keyboard up, on a screen that
> deliberately does not scroll. The guard written to catch it encoded an **invented constant**
> — "a keyboard takes 250 points" — and passed through two of those runs while the device
> failed identically, because **a soft keyboard cannot be measured in a browser**:
> react-native-web has none, so no browser measurement can ever supply that number.
>
> A measurement of the fold is still worth taking when a field is added, and
> `browser/signin-fit.spec.ts` is the harness for it. But what this clause asserts is the
> **ordering**, because a guard that asserts only a number passes again the moment a control
> shrinks.

## 6. The address is a destination, never a permission

Nothing in the app may read the backend address to decide what to show, what to enable, or
what a person may do (FR-007).

> **Why.** Principle II decides visibility once, on the server. An address that changed what
> the app displayed would be a second visibility decision living on the client — the thing
> that principle exists to forbid, arriving by a route nobody would look for it on. A person
> who points the app at a different server gets **that server's** answers. They do not get
> more of this one's.

A test MUST assert this structurally: no module that renders or gates content may read the
stored address. The address is read where the data layer is constructed, and nowhere else.
