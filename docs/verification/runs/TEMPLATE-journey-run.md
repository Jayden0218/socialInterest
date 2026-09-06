# Journey Run — <date> — <tier A | tier B>

Copy this file, fill it in, never edit it after the run.

| Field | Value | Required? |
|---|---|---|
| tier | `A` (automated, over HTTP) or `B` (through the app's own screens) | **Yes** |
| runtime | `browser` or `android-emulator` | **Yes** |
| device | Model and OS version, when a device was used | When applicable |
| version | Commit the run was taken on | **Yes** |
| date | | **Yes** |
| evidence | A non-blank capture of the app's own interface | **Yes** when `runtime` is `android-emulator` |

### `runtime` may only be `browser` or `android-emulator`

**`android-device` and `ios` are not producible by feature 003** and must never appear in a
run it generated. The former needs hardware; the latter needs a macOS host. Both are reported
unverified, and recording either here would be a false record (003/FR-005, FR-018).

### `evidence` must be checked by eye

The only Android capture in this project's history is **entirely black** — taken while the
emulator was crashlooping and the app was not installed. A blank capture proves nothing and
must fail the run (003/FR-002).

## Results

One row per journey in `contracts/e2e-journeys.md`. A journey not attempted is
`not run`, never blank.

| Journey | Result | Note |
|---|---|---|
| J-01 sign in | pass / fail / not run | |
| J-02 browse catalogue | | |
| J-03 follow an interest | | |
| J-04 publish an image | | |
| J-05 publish a video | | |
| J-06 home feed | | |
| J-07 interest space | | |
| J-08 comment | | |
| J-09 report | | |
| J-10 block | | |
| N-01 unauthenticated request | | |
| N-02 private post as non-author | | |
| N-03 blocked person's post | | |
| N-04 media not permitted | | |
