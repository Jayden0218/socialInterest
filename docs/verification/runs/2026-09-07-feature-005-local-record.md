# Feature 005 — what was verified, and where, on 2026-09-07

A record of observations, not a summary of intentions. Every figure below was
produced by a command in this repository against a running stack; anything not
run says so, in the words it deserves.

**Scope**: `specs/005-reviews-and-group-chat` — reviews and ratings on places,
group chat, and the guards each of them needed. Commit `22c287d`.

**Read the last section first if you are deciding whether 005 is done.** Two of
its twelve criteria are not met by anything here, and one of those cannot be met
without a device.

## Suites

| Command | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm --filter @sih/api test` | pass, exit 0 (matrix output below) |
| `pnpm --filter @sih/mobile test` | **71 passed**, 7 suites |
| `pnpm --filter @sih/workers test` | 6 passed |
| `pnpm --filter @sih/e2e test` | **128 passed**, 21 suites, 0 failed — journeys + browser cases over real HTTP. See **The run that was not a result** for the red run before it |
| `node scripts/verify-maestro-ids.mjs` | 150 selectors across 19 flows; 178 literals, 38 dynamic prefixes |
| `pnpm --filter @sih/shared generate:client` + `git diff --exit-code` | no drift between the contract and the client |
| `pnpm verify:register` | no unbacked verification claim |

The visibility matrix, printed by the suite itself:

```
ConversationAccess contract: 48/48 assertions run
001/SC-009 + 004/SC-005: 462/462 post assertions run (11/11 post surfaces built).
005/SC-005: 18/18 review assertions run (place reviews built).
```

480 assertions, zero skipped, across twelve surfaces.

## Success criteria

| Criterion | Result | How, and with what |
|---|---|---|
| SC-001 rating visible within 1s | **met** | `ratings.spec.ts` J-21; the summary is re-read from `GET /places/{id}`, so the number asserted is the server's, not the tap's |
| SC-002 average matches the ratings behind it | **met for 12 places, NOT the 100 the criterion asks for** | `ratings.spec.ts` J-22. Each place needs its own creator to stay inside FR-046's creation limit, so 100 would be 100 sign-ups for an arithmetic property a dozen establishes. **Recorded as 12, not quietly rescaled** — the reason is rate limits, not the property being weaker |
| SC-003 a second rating replaces the first | **met** | `rating-replace.spec.ts`, asserted rather than assumed |
| SC-004 a blocked person's review is absent, both directions | **met** | `reviews.spec.ts` J-27/J-28 through the data layer, and `negative.spec.ts` N-06 through a raw request — the path a modified client would take |
| SC-005 every review surface enumerated and proven to consult the boundary | **met, 18/18, zero skipped** | The matrix plus `surface-routing.spec.ts`. The matrix alone never could: every row runs the same `decide()`, so 18 assertions would otherwise mean one function tested 18 times |
| SC-006 a reported review reaches the same queue, record outlives it | **met** | `review-moderation.spec.ts`, including the assertion that removal takes the SCORE out of the average — removal that only hid the text would leave the abuser's 1-star counted |
| SC-007 three people each receive everything | **met** | `groups.spec.ts` J-33, all three messages to each of three people — not "some messages arrived" |
| SC-008 pre-005 conversations still readable under their original id | **met** | `conversation-migration.spec.ts`, which writes rows in the **old shape** and reads them through the new code. Verifying this by creating new conversations would prove nothing: the new write path produces whatever the new read path expects, and the test would pass against a migration that never ran |
| SC-009 a stranger's group invite notifies nobody | **met, zero** | `groups.spec.ts` J-38, held over a 1.5s window with `consistently` rather than checked once |
| SC-010 the cap cannot be exceeded past the app | **met** | `negative.spec.ts` N-09, both ways past a cap: 25 in one create, and one-at-a-time onto a full group. Also asserts nothing was half-written |
| SC-011 leaving stops delivery, prior messages remain | **met** | `groups.spec.ts` J-37 |
| SC-012 the blocked-add refusal is indistinguishable | **met, compared as literal responses** | `negative.spec.ts` N-10, and **verified to catch a leak**: with the block branch temporarily throwing a distinguishable message, the statuses still matched and the bodies did not |

## The run that was not a result

The first e2e run reported `29 failed, 99 passed`, and **none of the 29 was a
defect**. Every one failed with `TypeError: fetch failed`.

The cause was mine: `apps/e2e` boots its own API process in `globalSetup` and
kills it in `globalTeardown`, and I had two whole jest invocations running at
once. The first one's teardown killed the server the second was using, so every
suite after that point failed on the network. The config says so in its own
comment — *"runInBand and a long timeout are deliberate: the fixture boots an API
process ... and parallel workers would race over both"* — and I raced two
processes instead of two workers.

Recorded rather than quietly re-run, for two reasons. It is the third time this
session that a wrapper's exit code was mistaken for a result: `cmd & echo started`
reports the exit of `echo`, and two earlier "exit 0" notifications meant nothing
at all. And a red run explained away without reading it is exactly how a real
defect gets filed as flake — the check that made this safe to dismiss was that
the failures were network errors in suites that had passed minutes earlier, not
that re-running made them go away.

Run alone, the same commit gives **128 passed, 21 suites, 0 failed** — including
every suite that had failed, and `conversations.spec.ts` in full.

## What running it found

Six defects, and the one that matters most was found by the guard written to
prevent it — after it had already happened.

**Three live defects in one place.** T075 asks for a structural guard that the
`state` authority cannot move back to the conversation item. Three sites in
`ConversationService` were already deciding from `view.state` directly: the
message-count gate, the reply-accepts rule, and accept/decline. Each is correct
for every pair and reads the meta item's placeholder for every group.

Accept/decline was the worst. It called `setState`, which writes the meta item
**and every participant row**. One invitee tapping Accept on a group invitation
accepted it on behalf of everyone who had not looked, and un-declined it for
anyone who had said no.

Twelve tests exercise the request rules and **all of them hold pairs**, where the
conversation's state and both people's are the same fact. The defect is only
observable with three people in three different states at once.
`group-state-per-participant.spec.ts` now constructs exactly that, and was
verified by reverting the fix: three go red, the pair test stays green.

**The backfill would have corrupted 21 rows.** Its dry run offered to "repair"
group participant states by copying the meta item's placeholder over states that
were correct — turning every pending group invitation into an accepted one,
silently, for everybody. Found by *running* the dry run rather than trusting the
script. It now skips groups, and a guard asserts it does.

## What is NOT verified

Stated plainly, because a criterion reported as met when it was not is worth
less than one reported honestly as open.

| | Status |
|---|---|
| **005 on a device** | **Never run.** `20-rate-place.yaml` and `21-group-chat.yaml` are written and every selector resolves, but no emulator run has executed them. The flows are unproven; treat their passing as unknown, not likely |
| SC-002 at the stated scale | 12 places, not 100. See the table |
| 001/SC-011 — a video PLAYING | Unchanged by 005 and still open. `19-publish-video` asserts the poster frame, not playback |
| iOS | Nothing has ever run. The Simulator is macOS-only |
| 002/SC-002 — 10,000 concurrent | Unmeasured. Only a provisioned-DynamoDB run can close it, and the owner declined the spend (2026-09-07). Report it unverified, never as met |
| Real usage | Nobody has used the product. Retention, second-post rate and onboarding success are unanswered, and a script exercising those paths measures the script |
| The datastore decision | The owner's, and recorded as **pending** — "decide later, keep building local", 2026-09-07 |
| A public deployment | There is still nowhere to run this. DynamoDB Local is a dev tool |

## Cost

Zero. Everything above ran on the `local` profile — DynamoDB Local, MinIO,
ffmpeg, a local JWT issuer, all in Docker. No cloud resource was provisioned, and
none was asked for.
