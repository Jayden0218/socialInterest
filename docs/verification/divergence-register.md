# Divergence register

**Reinstated 2026-09-06** by feature 004. It was removed on 2026-09-05 when AWS was dropped
and every port had exactly one implementation, leaving nothing to diverge. `README.md`
said it would come back if the situation changed. It has.

A **divergence** is a place where what runs here and what would run in a hosted deployment
are different implementations rather than emulations of one another. Constitution V: a
passing local test against one of these **MUST NOT** be reported as evidence that the other
works, and each entry needs a stated plan to verify the production path before launch.

Rules:

- An entry is added in the same change that introduces the divergence.
- `Verified` may only say `yes` when a run record in `runs/` supports it, by name.
- Removing an entry requires the divergence to be gone, not merely uninteresting.

---

## D-004-1 — Chat messages are delivered by holding an HTTP request open

| Field | Value |
|---|---|
| **Introduced by** | `specs/004-chat-places-and-depth`, research R1 |
| **Local implementation** | `GET /v1/conversations/{id}/messages?wait=25` — the server holds the request open until the durable event bus emits `message.created` for that conversation, or 25 s elapse |
| **What a hosted deployment would do instead** | Not this. A managed edge terminates idle connections well before 25 s, a load balancer bills and bounds concurrent connections, and horizontal scaling puts the waiter and the writer in different processes so an in-process event bus never reaches the waiter at all |
| **Why it was chosen anyway** | Delivery is sub-second with one in-flight request per open conversation, no second protocol, no new dependency, and every assertion stays an HTTP request `apps/e2e` can make. In this codebase that last property is not a convenience: every defect that has actually shipped was invisible to a unit test and visible to a request |
| **What a green local suite does NOT prove** | That chat works when hosted. It proves the semantics — ordering, cursors, request/accept/decline, block severance — and says nothing about the transport surviving an edge, a balancer, or more than one API process |
| **Plan to verify the production path** | Blocked on the hosting decision, which does not exist (`specs/003-device-and-hosting/datastore-decision.md` is open and there is no hosting story at all). When one is made: re-run `apps/e2e/journeys/conversations.spec.ts` against the hosted deployment unchanged. If the transport has to change, the journeys are the acceptance test for its replacement |
| **Measured locally, 2026-09-07** | `bench:chat --holders=200`: one API process held **200 concurrent long polls**, delivery p95 **51ms** (p50 39ms, max 53ms). At 5 holders, p95 65ms. So the server's connection handling is not the limit at this scale — which says something real about the LOCAL implementation and nothing at all about a hosted one |
| **Verified** | **no** — and it cannot be, today. There is nowhere to run the production path. The measurement above is not verification: it is a property of one Node process holding sockets, and every reason this entry exists (edge idle timeouts, balancer connection limits, a waiter and a writer in different processes) is untouched by it |

**Scope note.** This entry is filed under Constitution V's *rationale* rather than its letter.
The letter describes a local stand-in for a production service; long-poll is not a stand-in,
it is the only implementation there is. What makes it belong here is the thing the principle
exists to prevent: a green suite that looks like coverage of a path nobody has run. Filing it
now, before hosting exists, is cheaper than discovering the distinction after a launch.

---

## Feature 008 — no new divergence, and one deliberate non-adoption

**Recorded 2026-09-09 (008/T005).** Constitution V requires every divergence between a local
stand-in and a production service to be named. **Feature 008 introduces none**, and the one
place it could have is worth stating rather than leaving to inference:

**Post text search does NOT adopt a managed search service.** 001/D3 named OpenSearch as the
replacement for the in-memory catalogue cache "when post-content search arrives", and 008/US6
is that moment. It was not adopted, for the reason the Cost and Environment constraint gives:
a managed service is billable and needs specific owner approval, which has not been sought or
given. Post search is served by a term index in the existing table (008 research R6) — the
same shape as `postInterestIndex`, application code and not a stand-in for anything.

So there is nothing to verify against a production path, and no entry is opened. **If a
search backend is ever adopted, Principle V applies again** and this section becomes an open
entry rather than a note.

The same is true of the other 008 additions — the notification read watermark, the Following
feed, avatars, replies, mentions, drafts, mute, private accounts, appeals and collections are
all application code against the same DynamoDB API. DynamoDB Local speaks that API, which is
why 001/D9 gives it no adapter, and that reasoning is unchanged.

**What this note does not claim.** It says 008 adds no *new* divergence. The register's one
open entry (chat long-poll) is untouched and still unverified, and the absence of a
production hosting story — which is what makes it unverifiable — is unchanged by 008.

---

## Entries closed

None. This register has one open entry and no closed ones.
