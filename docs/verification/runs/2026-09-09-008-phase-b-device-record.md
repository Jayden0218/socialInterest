# 008 Phase B on Android — run 51, 26/26

**Date**: 2026-09-09 · **Run**: [51](https://github.com/Jayden0218/socialInterest/actions/runs/34320251913)
· **Commit**: `59bf5d2` · **Branch**: `claude/spec-kit-integration-juhrza`
**Task**: T107

Booted in **62 seconds**. Flows ran 06:49:10 → 07:23:03, no device drop, no retry.
`PASS: the real APK ran on Android, exercised the real API, and completed the journeys.`

## What the aggregate says, against run 50's

Every difference is exactly the line the fixed flow was supposed to add, and nothing else
moved. That is the point of reading this table rather than the flow result: a green flow
proves a screen did not time out, and these numbers prove the SERVER was reached.

| Line | Run 50 | Run 51 | What the delta is |
|---|---|---|---|
| `POST /v1/media/uploads` 201 | 12 | **13** | the avatar upload — US5, and the line that did not exist before Phase B |
| `PATCH /v1/me` 200 | 1 | **3** | the avatar SET and then REMOVED (FR-017, both directions) |
| `PUT /v1/conversations/with/:handle` 200 | 2 | **3** | the share opened a pair conversation with somebody never messaged (US4, FR-011/FR-012) |
| `POST /v1/conversations/:id/messages` 201 | 4 | **5** | the post itself, sent |
| `GET /v1/people` 200 | 18 | **34** | the recipient search actually ran this time |
| `GET /v1/search/posts` 200 | 11 | 11 | US6, passing in both runs |
| `PUT /v1/notifications/read` 204 | 3 | **4** | US2's writer |
| `GET /v1/feed/following` 200 | 25 | **26** | US3's surface |
| `POST /v1/posts` 201 | 10 | 10 | unchanged, as it should be |

**13 uploads for 10 posts** is the avatar arithmetic: the multi-photo post accounts for +2 and
the avatar for the thirteenth. Run 50's 12 is what said, before any theory, that no avatar
upload had been attempted.

`docs/screens/android/10-edit-profile.png` shows the editor with **Add photo** — because
`27-set-avatar` removes the picture at the end, which is FR-019's other direction working.

## It took two runs, and BOTH of run 50's failures were mine

Run 50 was **24 of 26**. (I first reported it as "22 of 24" without counting the flows; the
correct figures are here.) Neither failure was a defect in the server.

### `26-send-post` — a Maestro selector is a REGEX, and mine matched a text field

The flow taps a recipient with `share-person-.*`, because it cannot know a handle in advance.
The search field was `share-person-search`, which that pattern matches and which renders
FIRST. The tap focused the field. Nothing was sent — which is why the whole run showed **no
4xx anywhere**, on any path.

**The browser settled it, not the reading.** `apps/e2e/browser/share-sends.spec.ts` drives the
same containers against a real API — publish, open, share, search a real recipient, tap — and
the sheet closed in **3.9 seconds** with no error. So the product's send path worked and the
device flow never reached it. 38 seconds against a 35-minute run; the same argument as
`media-pager-fit.spec.ts`.

The flow also claimed it was "sending to yourself", which is impossible:
`PersonSearchService` excludes the viewer from their own results, deliberately — **the same
fact that had broken a journey of mine an hour earlier, in `post-search.spec.ts`**. It sends
to `GROUP_MEMBER_C` now, a real second person the group fixture already exports, by exact
testID.

### `27-set-avatar` — the app handed off to a system window nothing could close

`onChangeAvatar` awaited `library.pick()`, which on a device opens `com.android.documentsui`.
The flow waited 120 seconds while a modal owned by another app sat in the foreground.

Compose never had this problem, because it does not hand off blind: it shows the app's own
`MediaPickerScreen`, with the device library behind an explicit control that
`10-publish-from-library` drives and deliberately stops at. Setting a picture takes the same
route now — the consistent product, and the one a device can drive.

**No browser journey could have caught it**: react-native-web has no native picker, so
`pick()` falls through to the bundled sample set and everything works. **No screen test
either.** `apps/mobile/src/__tests__/avatar-container.test.tsx` presses the real control and
asserts the route and the data layer, verified RED against a no-op handler.

## The guard that would have caught the first one

`verify-maestro-ids.mjs` has always known selectors are regexes and never checked whether one
could ALSO match a literal the app declares. It does now — and writing it exposed that the
script had been misreading selectors all along: **its id capture class excluded `*`**, so
`share-person-.*` had been read as `share-person-.` since the check was written. Verified red
against run 50's exact shape.

It immediately found a second, live ambiguity: `post-.*`, in six flows, also matches
`post-caption`, `post-detail-screen`, `post-media` and `post-image`. Those literals are not
mounted on the screens those flows are on, so it worked **by luck rather than by meaning** —
which is exactly how run 50's failure was written. A postId is a ULID and the selectors say so
now (`post-[0-9A-Z]{26}`).

## Still not verified after this run

- **Native font scaling (SC-017's other half).** `safety-fit.spec.ts` measures layout at 130%
  text in a browser and says so. react-native-web ignores the platform font setting entirely,
  which is why 006's `Avatar` overflow was invisible there. This run did not vary the device's
  font setting, so the screen-size half is closed and the font half is not.
- **iOS**, **002/SC-002**, **real usage**, and the **datastore and hosting decisions** are
  unchanged by Phase B.
- **Phases C–E (T108–T226) are not built.**
