# Journey Run — <date> — Tier <A|B>

Fields per `specs/002-production-readiness/data-model.md` § Journey Run.

| Field | Value |
|---|---|
| tier | `A` (automated, over HTTP) or `B` (physical device) |
| platform | `ios` / `android` / `n/a` |
| device | **Required when tier is B.** Model and OS version |
| version | Commit verified |
| date | |

## Results

| Journey | Result | Notes |
|---|---|---|
| J-01 sign in | | |
| J-02 browse catalogue | | |
| J-03 follow an interest | | |
| J-04 publish an image post | | |
| J-05 publish a video post | | |
| J-06 home feed | | |
| J-07 interest space | | |
| J-08 comment | | |
| J-09 report | | |
| J-10 block | | |
| N-01 unauthenticated request | | |
| N-02 private post as non-author | | |
| N-03 post from a blocked person | | |
| N-04 direct media fetch, not permitted | | |

A Tier B run is not satisfied by a simulator. If it was a simulator, it is not this record.
