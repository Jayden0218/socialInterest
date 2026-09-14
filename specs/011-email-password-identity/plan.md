# Implementation Plan: Email and Password Identity

**Branch**: `claude/pensive-goldberg-jjjni5` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-email-password-identity/spec.md`

## Summary

Add a way to **obtain** a credential, and change nothing about what one permits.

A person creates an account with an email address and a password, picks a handle and a
display name, and is in. They sign in again later, stay signed in across relaunches, and
can sign out deliberately. Password reset is a separate slice because it is the only part
needing an outside service.

The approach is deliberately unambitious: the existing JWT issuer keeps issuing, three new
rows go into the existing table under the existing key scheme, and `Person` is untouched.
The interesting work is in three places where the obvious implementation is wrong —
uniqueness under concurrency, timing equivalence on refusal, and a reset that actually ends
outstanding sessions.

**The research phase found a live defect** (R1): handles are not unique today, and a
duplicate *shadows* the original across thirteen call sites. US1 is the first thing that
lets a human choose a handle, so establishing uniqueness is a prerequisite of it rather
than a detail inside it.

## Technical Context

**Language/Version**: TypeScript 5.7, Node 22

**Primary Dependencies**: NestJS 11 (API), Expo SDK 54 / React Native (app), `pg`,
`jsonwebtoken`. **No new runtime dependency** — `scrypt` and `timingSafeEqual` are in
Node's `crypto` (research R2)

**Storage**: Postgres, single table, existing key scheme. Three new row kinds, no schema
change

**Testing**: jest — unit, contract, visibility and integration projects; `apps/e2e` driving
the app's own data layer over HTTP; Maestro flows on a device

**Target Platform**: Android (physical device and emulator); the API on a laptop today, a
host later

**Project Type**: Mobile app + API

**Performance Goals**: account creation under 60 seconds end to end (SC-002); password
derivation slow enough to be worth doing and fast enough not to be a denial-of-service on
one process

**Constraints**: no new public routes beyond two; no movement in the visibility matrix or
the operator snapshot; no payment method anywhere; password derivation cost must be the
same for a present and an absent account

**Scale/Scope**: one owner and a handful of people. Sizing for more would be inventing a
requirement

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1.*

| Principle | Assessment |
|---|---|
| **I. Interest Is the Unit of Meaning** (NON-NEGOTIABLE) | **Not engaged, and checked rather than waved past.** This feature adds no surface, no post path and no ranking input. The one interaction is that account creation lands on the cold start — which is 007/FR-014 working as designed, because it keys on the account and a new account has declared nothing (R8) |
| **II. Visibility Is Decided Once** (NON-NEGOTIABLE) | **Engaged as a NEGATIVE obligation, and it is the feature's main risk.** A credential is the input to every visibility decision; a feature that mints credentials is one mistake away from minting one that sees more. FR-024 and FR-025 make this mechanical — the matrix and the operator snapshot must come out identical — and the contract states that a moved number means the feature did something it was not asked to do |
| **III. Privacy Enforced Server-Side** | **Directly engaged.** Passwords are verified where a client cannot bypass it; the timing guarantee (R3) is enforced by measurement because the natural implementation leaks it. The email address is not added to `PublicProfile` — `profile.projection.ts` is the one place one is built, and adding it there would publish it on all seven projections |
| **IV. Safety Ships With the Product** | **Not weakened.** Reporting, blocking and moderation are untouched. Worth noting the direction of travel: an account with an email is *more* actionable by moderation than an anonymous token holder, not less |
| **V. Emulation Is Not Evidence** | **Engaged, and it is why the identity provider stays** (R5). A managed identity service would mean verifying its tokens in production and local ones in tests — two implementations selected by configuration, the shape the four AWS adapters were deleted for. US4's mail sender **is** such a divergence and is registered as one when it lands (R6) |

**Gate: PASS.** No violation to justify, so the Complexity Tracking table is omitted rather
than filled with "none".

**Re-checked after Phase 1 design**: still PASS. The design added three rows, none readable
by any route, and no read path. The one thing that moved from "assumed" to "decided" is
that credential verification gains a datastore read for the epoch (R4) — a real cost on the
hottest path in the product, measured rather than assumed, and noted below.

## Project Structure

### Documentation (this feature)

```text
specs/011-email-password-identity/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R8
├── data-model.md
├── quickstart.md
├── contracts/
│   └── identity.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks, not created here
```

### Source code

```text
apps/api/src/
├── modules/auth/                    # NEW — the only new module
│   ├── auth.controller.ts           #   the two public routes
│   ├── auth.service.ts              #   sign-up, sign-in, and the timing guarantee
│   └── password.ts                  #   scrypt derivation and constant-time comparison
├── persistence/
│   ├── credential.repository.ts     # NEW — email → account
│   ├── handle-claim.repository.ts   # NEW — the R1 fix
│   └── keys.ts                      # three key builders added; nothing changed
├── adapters/local/
│   └── local-identity-provider.ts   # gains issuing for a person; verifying gains the epoch
└── ports/
    └── mail.port.ts                 # NEW, UNBOUND until US4 (R6)

apps/mobile/src/
├── features/auth/
│   ├── SignUpScreen.tsx             # NEW
│   └── SignInScreen.tsx             # email and password replace the token field
├── screens/
│   ├── SignUpContainer.tsx          # NEW
│   └── SignInContainer.tsx          # rewritten around credentials
└── data/session.ts                  # signUp / signIn beside the existing signOut

apps/api/tests/
├── integration/auth.spec.ts         # NEW — including concurrency and timing
└── unit/                            # the negative guards
```

**Structure Decision**: one new API module, two new repositories, one new port, two app
screens. Nothing existing is restructured. The module boundary matters: `auth` is the only
thing that may touch a credential row, and nothing outside it may read one.

## Phasing, and what each phase is worth on its own

| Phase | Stories | Independently shippable? |
|---|---|---|
| **A** | handle uniqueness (R1) | Yes — it is a defect fix and stands alone |
| **B** | US1, US2 — sign up and sign in | Yes. The app opens normally. **This is the MVP** |
| **C** | US3 — stay signed in, sign out | Yes, and mostly inherited from 009 |
| **D** | US4 — password reset | Yes, and deliberately last: it is the only part needing an outside service |

**A before B is not a preference.** US1 is the first thing that lets a person choose a
handle, and choosing from a space with no uniqueness constraint is how two accounts end up
addressing each other's mentions.

## The three places the obvious implementation is wrong

Recorded here because they are the whole technical content of this feature, and each is
invisible to the test somebody would naturally write.

1. **Uniqueness is a property of the write.** A lookup followed by a create passes every
   sequential test and fails under exactly the two simultaneous requests it exists for.
2. **Refusal timing is part of the refusal.** Returning early for an unknown address
   satisfies the message and leaks the answer by two orders of magnitude.
3. **A reset must end what came before it.** Otherwise it is a password change wearing the
   name of a remedy.

## Risks

| Risk | Response |
|---|---|
| Credential verification gains a datastore read (R4), on the hottest path in the product | Measure it. If it costs, the epoch can be cached per request beside `RelationshipCache`, which 008 already does for privacy |
| A public route becomes public by accident beyond the two intended | `auth-surface.spec.ts` enumerates every route and compares against a snapshot; it has already caught this twice |
| The password floor is a guess | It is: 10 characters, recorded in Assumptions with the reasoning, changeable in one place |
| US4 never ships, leaving reset unavailable | FR-022 makes that a stated condition rather than a broken control |
