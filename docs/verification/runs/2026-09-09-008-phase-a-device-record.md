# 008 Phase A on Android — run 49, 23/23

**Date**: 2026-09-09 · **Commit**: `7f9ccef` · **Run**:
[34307545798](https://github.com/Jayden0218/socialInterest/actions/runs/34307545798)
**Tasks**: T057, T058

```
PASS: the real APK ran on Android, exercised the real API, and completed the journeys.
```

Emulator booted in **63 seconds**. 23 flows, one Maestro session each, **no retries and no
device drop**. Three of the flows are new in 008.

## The aggregate — where the evidence actually is

Asserted **through the service**, not through the view hierarchy. Phase A's three stories,
each with a line that would be absent if the story did not work:

| | Calls | Story |
|---|---|---|
| `PUT /v1/notifications/read` **204** | **4** | **US2** — `readAt` has a writer, on a device |
| `GET /v1/feed/following` **200** | **23** (+9 × 304) | **US3** — the tab is a surface, not a label |
| `POST /v1/media/uploads` **201** | **11** for **9** `POST /v1/posts` **201** | **US1** — one post carried three images through presign, PUT and publish |

Two of those lines did not exist in the product a day ago. `PUT /v1/notifications/read` had no
route; `GET /v1/feed/following` had no service. The 25 × 401 on `feed/following` and 25 on
`feed/home` are the signed-out app before `01-sign-in` — the same shape both feeds show, which
is itself a small check that the new one is wired like the old.

Unchanged and still working: `POST /v1/signals` 201 × 11 and `GET /v1/me/feed-signals` 200 ×
23 (007's premise), the full group lifecycle, `POST /v1/reports` 201, `PUT
/v1/places/:placeId/rating` 200 × 2, `POST /v1/me/seed-interests` 201 × 2.

## The screenshot says the rest

`docs/screens/android/05-home-feed.png`, from this run:

- **"For you" and "Following" are both live**, "For you" underlined as selected. It was
  rendered `disabled` for a whole feature.
- **A `1/3` badge** on the multi-photo card — FR-003, on a real device: a browse surface says
  there is more than one item without becoming navigable per item.
- "three photographs from one post" is that post, published by `23-multi-photo-post`.

## It took two runs, and both of run 48's failures were mine

**Run 48 (`c621501`): 21/23.**

1. **`19-publish-video`: `media-item-video-1` not found.** Adding two sample images moved the
   video to index 3. The testID carried the KIND for exactly this reason and still carried a
   GLOBAL index, so it was half a fix — and `verify-maestro-ids` passed the broken selector,
   because a computed index under a dynamic prefix is precisely what it cannot see. The index
   is per-kind now.
2. **`23-multi-photo-post`: `media-pager is not visible`.** `MediaPager`'s wrapper had no
   `flex` inside `post-media`'s `aspectRatio` frame, so it mounted and collapsed to zero
   height.

**Nine component assertions were green throughout, and they were not wrong.** React Native
Testing Library performs no layout, so a tree that mounts and a tree that occupies space are
different claims and only the first is testable there. Same shape as the profile grid 007
shipped, where "every test asserts the post is PRESENT, and it was".

**The second was measured before it was changed.** `browser/media-pager-fit.spec.ts`
reproduced it in one 38-second run with the reason attached —
`locator resolved to HIDDEN <div data-testid="media-pager">` — where the emulator took 36
minutes to say "not visible". Prefer the free observation to the expensive guess.

## What this run does NOT verify

- **Native font scaling.** No flow changes the platform font size. SC-017's screen-size half
  is measured in `browser/safety-fit.spec.ts`; the font half remains unmeasured, and a browser
  cannot close it because react-native-web ignores the platform setting.
- **Phases B–E.** Specified and planned, not built.
- **iOS**, **002/SC-002 (10,000 concurrent)**, **real usage**, and the **datastore and hosting
  decisions** — all unchanged by 008 and all still open.
