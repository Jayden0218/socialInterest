# Contract: API delta

**Feature**: 008 | New and changed endpoints, by phase.

002's first defect was the contract and the API disagreeing about publishing —
OpenAPI said `uploadIds: string[]`, the server wanted `uploads: [{uploadId, key, kind}]`,
and any client generated from the contract 400s on every publish. Contract tests could not
catch it, because both sides generated from one document agree with each other by
construction. **Only a request catches it**, which is why every row below is exercised by an
`apps/e2e` journey over real HTTP against the app's own data layer, not by a generated
client.

`specs/001-interest-media-sharing/contracts/openapi.yaml` is updated in the same change as
the code, never after.

## Phase A

| Method | Path | Notes |
|---|---|---|
| — | `GET /v1/posts/{postId}` | **Unchanged.** Already returns every media item, presigned, in publication order. US1 is a client change. |
| `PUT` | `/v1/me/notifications/read` | Writes the read watermark. Idempotent. 204. |
| `GET` | `/v1/notifications` | **Changed**: `readAt` now derived and populated; response gains `unreadCount`. |
| `GET` | `/v1/feed/following` | New surface. `?cursor=<createdAt>&limit=`. Same page shape as `/v1/feed/home`. |

**Page shape warning.** `nextCursor` is nested under `page`, not top level. 007 found
`ApiPage<T>` declaring it at the top level, which made every list in the app exhausted after
page one — feed, interest spaces, profiles, comments, notifications — invisible to 165 green
mobile tests because every one stubbed the data layer with the same wrong shape. New list
endpoints use the existing nested shape and are asserted **against a real response**.

## Phase B

| Method | Path | Notes |
|---|---|---|
| `PATCH` | `/v1/me` | **Changed**: accepts `avatarUploadId`. The server derives the key from its own upload record — it never accepts a client-supplied key (002's second defect). |
| — | every profile-bearing response | **Changed**: `avatarUrl` present and **presigned**, from one projection (research R5). Today it appears on one surface of seven, as a raw storage key. |
| `GET` | `/v1/search/posts?q=` | New. Term-index candidates, then the boundary. Records no signals. |
| `GET` | `/v1/search/posts?q=` (no matches) | FR-022: returns interests and people matching the query in the same response, so the client needs no second request to render the fallback. |
| — | `PUT /v1/conversations/with/{handle}`, `POST /v1/conversations/{id}/messages` | **Unchanged.** US4 needs no endpoint (research R4). |

## Phase C

| Method | Path | Notes |
|---|---|---|
| `POST` | `/v1/posts/{postId}/comments` | **Changed**: optional `parentCommentId`, validated to be a comment on the same post. |
| `GET` | `/v1/posts/{postId}/comments` | **Changed**: replies grouped with their parent; a removed parent still returns, marked, with its replies (FR-026). |
| `PATCH` | `/v1/posts/{postId}/comments/{commentId}` | Edit own comment. Sets `editedAt`. 403 for anyone else, tested through the hostile path. |
| `DELETE` | `/v1/posts/{postId}/comments/{commentId}` | Soft delete; `commentCount` decremented in the same transaction. |
| — | post and comment responses | **Changed**: `mentions` — resolved userIds, not raw text (research R9). |
| — | media items | **Changed**: `altText`. |
| `POST` `GET` `DELETE` | `/v1/me/drafts`, `/v1/me/drafts/{draftId}` | Private by key. |

## Phase D

| Method | Path | Notes |
|---|---|---|
| `PUT` `DELETE` | `/v1/people/{handle}/mute` | Invisible to the subject. No response anywhere discloses it. |
| `PUT` | `/v1/posts/{postId}/dismiss` | Also emits a negative signal. |
| `PATCH` | `/v1/me` | **Changed**: `accountPrivacy`. |
| `GET` | `/v1/me/follow-requests`, `POST .../{handle}/approve`, `.../decline` | Pending state on the follow row (005/R2's finding). |
| `GET` | `/v1/me/moderation-notices` | FR-046: an author is told what was removed and why. |
| `POST` | `/v1/appeals`, `GET /v1/me/appeals` | FR-047. |
| `GET` `PATCH` | `/v1/moderation/appeals`, `/v1/moderation/appeals/{appealId}` | Operator only. Outcome appended to the moderation log. |

## Phase E

| Method | Path | Notes |
|---|---|---|
| `POST` `GET` `PATCH` `DELETE` | `/v1/me/collections`, `/v1/me/collections/{id}` | Names are user-generated content: reportable and moderatable. |
| `PUT` `DELETE` | `/v1/me/collections/{id}/posts/{postId}` | Additive to the saved list, in one transaction (FR-051). |
| `GET` | `/v1/me/collections/{id}/posts` | Passes the boundary; matrix surface 16. |

## Route hygiene — two failures worth not repeating

**`@Controller('v1')` under a global `v1` prefix gives `/v1/v1/...`.** Every 007 signals
route answered 404, then 500 once the path was fixed, because the caller was read from
`req.user` (Passport's convention) rather than this app's `req.viewer`. Invisible to
typecheck, to lint, and to `smoke:boot`, which checks other controllers. Every new controller
here is asserted by a boot-time route dump, not by inspection.

**Inserting a method above an existing `@Get` moves the `@Public()` decorator onto the new
method.** A write becomes public and the read starts 401ing, with typecheck and lint clean.
`tests/integration/auth-surface.spec.ts` enumerates every route and compares the public set
to a snapshot; every endpoint above updates that snapshot **deliberately**, as a reviewed
line in the diff. 004 recorded that a hand-picked list only covers mistakes already made —
this one is exhaustive on purpose.

## testIDs

FR-053: every new surface carries stable test identifiers, and 006/FR-027's snapshot still
binds. `verify-maestro-ids.mjs` runs over `.maestro/` **and** `.maestro/capture/`. Three
things it has refused before, all correctly: a space in a testID (a Maestro selector is a
regex), a slug built by a helper call (the verifier reads the leading literal of a template
in `testID=` position and cannot see through a call), and a flow referencing a `${VAR}` the
device runner never passes — which Maestro does not error on, it substitutes the literal and
waits thirty seconds, twenty minutes into a 25-minute run.
