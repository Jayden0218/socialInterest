# D-3 — Identity (local JWT issuer → Cognito)

**⛔ Requires an Approval Record.**

## What would count as proof

1. A token issued by the pool is accepted, and its `sub` maps to the same person
   the local path would resolve.
2. An expired token is refused with 401, not accepted or 500.
3. A token signed by another key or another issuer is refused.
4. Refresh produces a working token without the client re-authenticating.
5. The operator claim the moderation queue depends on survives the round trip —
   an operator must not silently become an ordinary viewer.

## Steps

1. Provision a user pool under the approved tag.
2. `RUNTIME_PROFILE=aws`; run J-01 and the N-01 negative journey against it.
3. Exercise (2)–(5) explicitly.
4. Record in `../runs/<date>-D-3.md`, then tear down separately.
