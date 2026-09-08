# Contract: signals

What is collected, what is promised about it, and what a client may say.

## What is collected

Four kinds, and only four (research R2):

| Kind | Recorded when | Payload |
|---|---|---|
| `open` | A post detail is opened | postId |
| `dwell` | A post was on screen, foreground, ≥3s | postId, dwellMs |
| `like` | A post is liked | postId |
| `save` | A post is saved | postId |

**Reports and comments are NOT signals**, and that is a guarantee this contract makes
rather than an omission. A report is not a preference; ranking on engagement with harmful
content is how a feed learns to promote it.

## What the client may say, and what the server believes

The client reports; the server decides what it is worth. A modified client can send
anything, so every bound is enforced server-side (Principle III).

| Client claim | Server treatment |
|---|---|
| `dwellMs` of any size | Clamped to 30000 before it is weighted |
| `dwellMs` below 3000 | Discarded, not weighted at zero |
| A signal for a post the viewer cannot see | Rejected. The post passes `VisibilityFilter` for that viewer or the signal does not exist |
| A signal for another person | Rejected. Signals are written only for the authenticated caller |
| A batch of any length | Bounded per request; the excess is rejected, not silently truncated |
| Repeated signals for one post in one session | Weighted once per kind per post per session |

Rejection is silent to the client — a signal is not something a person acts on, so a
failure has no useful message. It is counted server-side.

## What is promised

- **FR-013 / Principle III.** A person's signals are readable by that person alone. They
  appear on no surface belonging to anyone else and are not inferable from any public
  count, ordering, or aggregate.
- **FR-011.** Settings states what the feed is built from, in the person's own terms,
  rendered from the same weights the ranker reads — so the explanation cannot drift from
  the behaviour it describes.
- **FR-012.** Clearing removes the profile AND the raw events. Afterwards the feed ranks
  as it would for a new account with the same seed interests. Verified by asserting the
  store is empty, not by asserting the button was pressed.

## The hostile-client test

Constitution III requires the test to take the path a modified client would take. So:

1. Post a signal for a post the caller cannot see → rejected, no weight moves.
2. Post a signal naming another person as the subject → rejected.
3. Post `dwellMs: 999999999` → weighted as 30000, not as sent.
4. Read another person's profile through every enumerated surface → not present.
5. Clear, then read the store directly → empty.

A test that only drives the app's own client does not cover any of these.
