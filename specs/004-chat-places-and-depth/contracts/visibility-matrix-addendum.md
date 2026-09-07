# Contract: Visibility matrix addendum — four new surfaces, and one new boundary

**Feature**: `specs/004-chat-places-and-depth`
**Extends**: `specs/001-interest-media-sharing/contracts/visibility-matrix.md`
**Serves**: FR-009, FR-017, FR-029, FR-039, FR-040, FR-041 — verified by **SC-005**

This is a contract, not documentation. 001's matrix is unchanged: same seven post states,
same six viewer relationships, same decision table. What changes is the **surface list**,
which 001 explicitly designed to grow by rows rather than by new hand-written cases:

> "A new surface added later adds one row to the surface list, not a new set of
> hand-written cases."

This feature adds four rows. It also adds a second, separate boundary for a read path that
is not a post read at all, and says why that is an extension of Principle II's reasoning
rather than an exception to it.

## Part 1 — The surface list grows from 7 to 11

| # | Surface | Endpoint | Added by |
|---|---|---|---|
| 1 | Interest space | `GET /interests/{interestId}/posts` | 001 |
| 2 | Home feed | `GET /feed/home` | 001 |
| 3 | Profile | `GET /people/{handle}/posts` | 001 |
| 4 | Interest search results | `GET /interests?q=` | 001 |
| 5 | Share link resolution | `GET /posts/{postId}` | 001 |
| 6 | Notifications | `GET /notifications` | 001 |
| 7 | Comments | `GET /posts/{postId}/comments` | 001 |
| **8** | **Place page** | `GET /places/{placeId}/posts` | **004 / FR-017** |
| **9** | **Saved posts** | `GET /me/saved` | **004 / FR-039** |
| **10** | **Post shared into a conversation** | `GET /conversations/{id}/messages` → each `sharedPostId` | **004 / FR-009** |
| **11** | **In-interest post search** | `GET /interests/{interestId}/posts?q=` | **004 / FR-029** |

**Test shape**: 7 post states × 6 viewer relationships × 11 surfaces = **462 assertions**,
generated from the table. Up from 294. The generator is unchanged; the surface list is data.

Three of the four are worth a sentence each, because each has a shape that invites a
hand-written shortcut:

- **Surface 9, saved posts.** A save is a bookmark, not a copy. The saver may lose access to
  a post they saved. The tempting shortcut — "they saved it, so they could see it" — is
  wrong at exactly the moment it matters. FR-039, SC-013.
- **Surface 10, a post shared into a conversation.** The message is readable and the post
  may not be. These are two decisions, and the conversation boundary (Part 2) does not
  substitute for the post boundary. A reader permitted the message and not the post gets the
  message with an unresolvable post, distinguished by 001's error table.
- **Surface 11, in-interest search.** Search is a read path. 001 already says so about
  interest search; this makes it explicit for post search, where a naive implementation
  matches text *before* filtering and leaks a caption in the count.

**Rule for anything added later**: a new endpoint that can return a post adds a row here in
the same change that adds the endpoint. An endpoint added without a row is an incomplete
change (Constitution II).

## Part 2 — Conversation access is its own boundary, decided once

Constitution II is written about post reads. A conversation is not a post, so II does not
bind here. Its **rationale** does: independently written membership predicates are
independent chances to leak, and a conversation is the most private thing this product will
hold. `ConversationAccess` is therefore a single boundary with its own table-driven test
(research R2).

### Viewer relationships

| Code | Meaning |
|---|---|
| `initiator` | The participant who sent the first message |
| `recipient` | The participant who did not |
| `outsider` | Signed in, not a participant |
| `anon` | Not signed in |

`participant` appears in prose below as shorthand for `initiator ∪ recipient`. It is **not**
a fifth axis — an earlier draft counted it as one and got the assertion count wrong.

### Decision table

`R` = may read the conversation and its messages. `W` = may send into it.
`✗` = refused, and the refusal must not disclose the conversation's existence.

| Conversation state | `initiator` | `recipient` | `outsider` | `anon` |
|---|---|---|---|---|
| `requested` | R, W *(one unanswered message only)* | R, W | ✗ | ✗ |
| `accepted` | R, W | R, W | ✗ | ✗ |
| `declined` | R, ✗W *(sends accepted and discarded — see rule 3)* | R | ✗ | ✗ |
| `severed` (block, either direction) | ✗ | ✗ | ✗ | ✗ |
| either participant `status` ≠ active | R (read-only) | R (read-only) | ✗ | ✗ |
| message `moderationState` = removed | message body withheld, thread readable | same | ✗ | ✗ |

**Rules the table encodes**

1. **There is no `follower`/`stranger` axis.** Membership is the whole question. A conversation
   is never partially visible, and no follow relationship grants access to one.
2. **A block severs in both directions and overrides everything**, exactly as it does for
   posts (001/FR-044). `severed` is symmetric: it does not matter who blocked whom, and the
   refusal is identical from both sides so a block is not disclosed (FR-006).
3. **A declined sender is not told.** Their send is accepted by the API and goes nowhere.
   This deliberately diverges from every other write in the product, which refuses loudly.
   It is the same reasoning as 001's "block returns 404, indistinguishable from deletion":
   a sender who learns they were declined has a reason to return with another account.
4. **`requested` allows the recipient full read.** They must be able to see what they are
   accepting. What `requested` withholds is the *notification* (FR-004), not the content.
5. **A departed participant leaves a read-only thread.** Consistent with 001's rule 4, where
   a non-active author's followers-only content becomes inaccessible immediately.
6. **A removed message withholds the body, not the thread.** Moderation removes content; it
   does not silently delete a conversation, which would be indistinguishable from a bug to
   both participants.

### Error distinction

| Situation | Status | Client message |
|---|---|---|
| Conversation does not exist, or viewer is an outsider | `404` | "Not found" — deliberately identical, so membership is not disclosed |
| Viewer is anonymous | `401` | "Sign in to continue" |
| Conversation `severed` | `404` | "Not found" — indistinguishable from non-existence, so a block is not disclosed |
| Send into `declined` | `202` | Accepted. Nothing is stored and nothing is delivered. |
| Send into `requested` when one unanswered message already exists | `409` | "Wait for a reply before sending again" |
| Send into `severed`, or to a non-active person | `404` | "Not found" |

**Test shape**: 6 conversation states × 4 viewer relationships × 2 operations (read, write)
= **48 assertions**, generated from this table.

## Part 3 — What this contract does not cover

- Whether a *conversation* is discoverable — it is not; there is no search over messages and
  none is planned in this feature.
- Notification suppression (FR-004, FR-031). It is a creation-time rule (research R10), not
  a visibility rule, and its test lives with the notification builder.
- Message rate limiting (FR-008). A refusal there is a throttle, not an access decision.
