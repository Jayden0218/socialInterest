# Android emulator run 32 — 17/19, and both failures were mine

**Run**: https://github.com/Jayden0218/socialInterest/actions/runs/34094400772
**Commit**: `03ca1fb` · **Date**: 2026-09-07 · **Outcome**: fail · **Cost**: zero (public repository, GitHub-hosted standard runner)

## What happened

| | |
|---|---|
| Emulator boot | **62s** (07:19:24 → 07:20:26) |
| Journeys | 07:20:26 → 07:43:09, 19 flows, one Maestro session each |
| Result | **17/19 passed, each on its first attempt** |
| Failed | `20-rate-place`, `21-group-chat` — both new in 005 |

Every one of the seventeen pre-existing flows passed first time, and no device
drop occurred. The two failures are the two flows this run existed to execute,
and **neither is a defect in the product**. Both are defects in the flows I
wrote.

## Failure 1 — `20-rate-place`: a chained flow's write is inherited

```
[Failed] 20-rate-place (1m 44s) (Assertion is false: "Following" is visible)
```

That assertion is not in flow 20. It is inside `16-place-page.yaml`, which flow
20 chained with `runFlow`.

Each flow is its own Maestro session, but **they share one server**. Flow 16 had
already run, ten minutes earlier, and had already followed the place. Chaining
it here tapped `follow-place-toggle` a second time, which correctly UNFOLLOWED
the place — so `"Following"` was correctly not visible, and 16's assertion
correctly failed.

**A toggle is not idempotent, so a flow that chains another flow inherits its
writes.** Flow 20 now chains `15-attach-place.yaml`, which only publishes and is
safe to repeat, and performs 16's three navigation steps itself. That
duplication is deliberate and is the smaller cost: the alternative was weakening
a real FR-019 assertion that passes today.

## Failure 2 — `21-group-chat`: a field that could not be re-focused

```
[Failed] 21-group-chat (1m 34s) (Assertion is false: id: group-participant-grpmemberbd86aabe1 is visible)
```

Member A was found and tapped. Member B was not. The flow typed A's handle,
tapped A, then tapped the search field again, `eraseText`, and typed B's handle
— and B never appeared.

The fix is not a longer timeout. Handle search is a **prefix query** over the
handle index (`skPrefix: HANDLE#<needle>` in `PersonRepository.search`), and the
three seeded members share the prefix `grpmember`. One search returns all three.
So the flow now searches once and taps both, with nothing to re-focus and no
`eraseText` whose success depends on the field still holding focus behind a
results list.

## The fixture asserted the wrong thing, and that is why this cost a run

`seed-group-fixture.ts` already asserted "the flow can find each member" — by
searching each **full handle** separately. That passed. The flow does something
else, and the fixture's check was therefore about a search nobody runs.

It now asserts **the search the flow actually types**: one prefix query that must
return all three. And the prefix is exported as `GROUP_SEARCH` rather than
written as a literal in the flow, so the two files cannot drift.

Verified locally, free, in the sandbox — which is where this should have been
caught before spending a 30-minute run:

```
GROUP_SEARCH=grpmember
GROUP_MEMBER_A=grpmembera435e5f3a
GROUP_MEMBER_B=grpmemberbcca06ef3
GROUP_MEMBER_C=grpmemberc69252de5

GET /v1/people?q=grpmember&limit=20
3 results: ['grpmembera435e5f3a', 'grpmemberbcca06ef3', 'grpmemberc69252de5']
```

## What this run does and does not establish

**Establishes**: the 005 code does not break any existing journey. Seventeen
flows covering publishing, feeds, comments, reports, blocks, messaging, places,
saving, notification settings and video all pass on a real Android runtime
against a real API, on the commit that contains every 005 change.

**Does not establish**: anything about reviews or group chat on a device. Those
two flows have still never completed. `005 has never run on a device` remains
true and must be reported that way until a run says otherwise.

## The lesson, which this repository already had written down

`CLAUDE.md` says: *make the failure visible before changing anything, and prefer
the free observation to the expensive guess.* The free observation here was
available the whole time — the fixture runs against the local stack in seconds,
and the prefix search could have been checked with one curl. I wrote a fixture
assertion that tested a different search from the one the flow performs, which
is the same shape as a guard that reads its own prose: it looked like evidence
and answered nothing.
