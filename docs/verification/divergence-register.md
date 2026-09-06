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
| **Verified** | **no** — and it cannot be, today. There is nowhere to run the production path |

**Scope note.** This entry is filed under Constitution V's *rationale* rather than its letter.
The letter describes a local stand-in for a production service; long-poll is not a stand-in,
it is the only implementation there is. What makes it belong here is the thing the principle
exists to prevent: a green suite that looks like coverage of a path nobody has run. Filing it
now, before hosting exists, is cheaper than discovering the distinction after a launch.

---

## Entries closed

None. This register has one open entry and no closed ones.
