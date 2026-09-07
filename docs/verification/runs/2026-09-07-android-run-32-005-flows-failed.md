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


---

# Run 33 — 18/19, and the navigation fact I still had not checked for free

**Run**: https://github.com/Jayden0218/socialInterest/actions/runs/34097613841
**Commit**: `b21858f` · **Outcome**: fail · **Cost**: zero

| | |
|---|---|
| Emulator boot | 63s |
| Result | **18/19** — `20-rate-place` now **PASSES** |
| Failed | `21-group-chat` only |

`20-rate-place` passing is a real result: rating and reviewing a place works on a
device, entered through the app's own navigation. The API log shows
`PUT /v1/places/:placeId/rating` 200 and `GET /v1/places/:placeId/reviews` 200.

```
[Failed] 21-group-chat (1m 40s) (Element not found: Id matching regex: tab-chats)
```

**And the API log for that same run shows the group was fully built:**

```
1 "method":"POST","path":"/v1/conversations/groups","status":201
1 "method":"POST","path":"/v1/conversations/:conversationId/participants","status":204
```

So the product did everything asked of it. The flow then could not find its way
back: the conversation is a **pushed route**, and `App` renders the tab bar only
at the root of the stack — a pushed screen gets a header with `nav-back`
instead. `tab-chats` is genuinely not on screen, so the flow waited sixty
seconds for an element that does not exist there.

A second, latent fault in the same flow: `open-conversation-.*` matches
whichever row renders first, and by flow 21 the inbox holds several
conversations from earlier flows. Opening an arbitrary one would land on a pair,
which has no leave control at all — 004's `14-message-request` ordering defect,
in a new place. The group's open button is now `open-group-<slug>`, identified
by the group.

## The correction that matters more than either fix

Both facts are **navigation**, and neither is about Android. Both are settled by
a browser in three seconds. I spent two 25-minute device runs discovering them.

`005/J-21` now drives the whole flow through `apps/e2e/browser/navigation.spec.ts`
— create, send, back, find the row by name, open the group, leave — and asserts
the two facts explicitly:

```
expect(await page.locator(id('tab-chats')).count()).toBe(0);   // on a pushed screen
expect(await openGroup.count()).toBe(1);                        // exactly one open-group- button
```

It passes in 2,997ms, and all 15 browser journeys pass with it.

This does **not** replace the device flow, and must not be reported as if it
did: react-native-web renders the same components through DOM primitives, so it
says nothing about native layout, touch handling, or the platform. What it does
is settle the navigation for free, so a device run is spent on what only a
device can answer. That is what CLAUDE.md already meant by *prefer the free
observation to the expensive guess* — six emulator runs, four hung jest runs, and
now two more.

**005 on a device remains unverified.** `21-group-chat` has still never
completed.
