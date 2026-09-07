# The app's screens

Twenty screens, captured by `apps/e2e/scripts/capture-screens.ts` against a
**real API with real data** — real posts, a real place with two real ratings, a
real group conversation — driven through the app's own navigation.

Regenerate with:

```bash
npx tsx apps/e2e/scripts/capture-screens.ts    # from apps/e2e
```

## What these are, and are not

**Are**: the product's own React components, its own copy, its own data. Nothing
is mocked up; every number on these screens came back from the API.

**Are not**: native Android frames. `react-native-web` renders the same
components through DOM primitives, so native layout, fonts, safe areas, touch
handling and the back button are **not** what you see here. Constitution
Principle V — emulation is not evidence — applies: these show what the product
does, not that it does it correctly on a device.

The Android emulator does render real frames and 19/19 journeys pass on it
(`docs/verification/runs/2026-09-07-android-run-34-005-pass-19-of-19.md`), but
its screenshots upload to a GitHub artifact host this sandbox's egress denies, so
they cannot be fetched here. They can be downloaded from the Actions run page.

| # | Screen | Feature |
|---|---|---|
| 01 | Feed, signed out | 001 |
| 02 | Sign in | 001/US1 |
| 03 | Home feed | 001/US3 — only posts from interests you follow |
| 04 | Discover | 001/US2 + 004 — one search across interests and places |
| 05 | Discover, results | 001/US2 |
| 06 | Interest space | 001/US2 — the primary browse surface |
| 07 | Post detail | 001 |
| 08 | Comments | 001/US5 |
| 09 | Discover, place search | 004/US2 — scoped by locality |
| 10 | **Place with rating and reviews** | **005/US1 + US2** |
| 11 | Chats inbox | 004/US1 |
| 12 | New group, empty | **005/US3** |
| 13 | New group, participants chosen | **005/US3** |
| 14 | **Group conversation** — participants, add, leave | **005/US3** |
| 15 | Inbox with the group in it | **005/US3** — identified by name |
| 16 | Activity | 001/US6 |
| 17 | Profile | 001/US4 |
| 18 | Saved | 004/US5 |
| 19 | Edit profile | 004 — including notification preferences |
| 20 | Compose | 001/US1 |
