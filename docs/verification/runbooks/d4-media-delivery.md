# D-4 — Media delivery (direct MinIO read → CDN)

**⛔ Requires an Approval Record.**

## What would count as proof

1. **The one that matters (`002/FR-019`)**: a viewer who may not see a piece of
   media cannot retrieve it by requesting the object directly through the
   delivery path. This is N-04 run against production, and it is the reason this
   divergence exists — a CDN that caches an object for an unauthorised requester
   defeats every server-side visibility decision above it.
2. A signed URL expires when it says it does, and an expired one is refused.
3. A URL signed for one object does not grant another.
4. A visibility change takes effect for a viewer whose earlier request may have
   been cached — an immediately-effective flip (Principle II) must not be
   defeated by a cache TTL.

(4) is the subtle one. If the CDN serves a cached object after the post is made
private, the guarantee is broken in production while every test above the CDN
still passes.

## Steps

1. Provision a distribution under the approved tag.
2. `RUNTIME_PROFILE=aws`; publish a private post, then attempt (1) as a stranger.
3. Exercise (2)–(4).
4. Record in `../runs/<date>-D-4.md`, then tear down separately.
