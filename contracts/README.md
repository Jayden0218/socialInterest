# `contracts/` — the contract resolution layer

The **base** contract is `specs/001-interest-media-sharing/contracts/openapi.yaml`
and has not moved. This directory holds the **overlay** a downstream fork adds to
it, and nothing else.

`packages/shared/scripts/contract.ts` merges the two. Both consumers of "the
contract" read it through that one resolver:

- `apps/api/tests/contract/*.contract.spec.ts` — the contract suites
- `packages/shared/scripts/generate-client.ts` — the generated operation map

Before the resolver existed, those two agreed about which document to read by
each hard-coding the same four-deep relative path. 002's lesson is that two
sides generated from one document agree by construction — right up until one of
them reads a different document.

## Why an overlay instead of editing the base

A fork adding an endpoint would otherwise edit `openapi.yaml`, which upstream
also edits. Every sync would then conflict inside the contract — the worst file
to resolve badly, because the server and the generated client both come from it.

## What an overlay may contain

`paths` and `components.schemas`. That is all, and the resolver refuses
anything else.

An overlay that could set `servers`, `info` or `security` would not be an
overlay; it would be a second contract quietly replacing the first, and "which
document describes this API" would have two answers.

## What the resolver refuses

| Refused | Why |
|---|---|
| an operation (path + verb) the base declares | a silent override would leave the generated client describing the overlay's version while the base's server still implemented the other — and each would look right alone |
| a schema name the base declares | same |
| any top-level key but `paths` and `components` | an overlay adds; it does not restate |
| any `components` key but `schemas` | `securitySchemes` and shared responses belong to the base |

Adding a **verb** to a path the base already declares is allowed —
`DELETE /posts/{postId}` beside the base's `GET` is additive and unambiguous.

`packages/shared/scripts/contract.ts` splits the pure merge from the file
reading for one reason: upstream's overlay is empty, so resolving alone would
never exercise a real merge. `apps/api/tests/contract/contract-overlay.spec.ts`
drives `mergeContract` with a non-empty overlay, which is the only thing keeping
this seam honest between now and a fork's first endpoint.
