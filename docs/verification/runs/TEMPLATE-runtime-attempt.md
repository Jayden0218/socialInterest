# Runtime Attempt — <date>

Copy this file, fill it in, never edit it after the attempt.

A record of trying to start an Android runtime. It exists so that a failure produces
**evidence** rather than a hypothesis.

| Field | Value | Required? |
|---|---|---|
| date | | **Yes** |
| configuration | Image, ABI, options, runner image — enough to repeat it | **Yes** |
| outcome | `booted` / `failed` / `timed_out` | **Yes** |
| runtime_output | The runtime's OWN stdout and stderr | **Yes, always** |
| conclusion | What the output shows — not what it might mean | Only when not `booted` |

## `runtime_output` is required even on success

**A record with an empty `runtime_output` is invalid and must not be filed.**

Six attempts were made in feature 002 and not one captured this. Every diagnosis was
therefore a guess about a process nobody had observed, and one of them — that the runner
image was at fault — was asserted in project documentation and later had to be retracted.
This field is the whole reason this record type exists.

## The conclusion must be supported, not merely permitted

State what the output shows. If the output names a cause, name it. If it does not, say that
it does not. **A conclusion the output permits but does not evidence is the failure mode this
record was created to prevent.**

## Attempt

| Field | Value |
|---|---|
| date | |
| configuration | |
| outcome | |
| runtime_output | `<path to the attached log>` |
| conclusion | |
