# Load Measurement — <date>

Copy this file, fill it in, never edit it after the run.

| Field | Value | Required? |
|---|---|---|
| transport | `http` or `in-process` | **Yes** |
| datastore | What the reads actually hit | **Yes** |
| version | Commit measured | **Yes** |
| date | | **Yes** |

`transport` is mandatory because feature 001's headline figure was taken
in-process and read as though it were not.

## Latency by concurrency

| Concurrency | p50 | p95 | p99 | Throughput | Errors |
|---|---|---|---|---|---|
| 1 | | | | | |
| 10 | | | | | |
| 50 | | | | | |
| 100 | | | | | |

**first_breach** — concurrency at which p95 first exceeds 2000 ms: `<n>`

## Attribution

| Field | Value |
|---|---|
| bottleneck | `generator` / `application` / `datastore` / `undetermined` |
| bottleneck_evidence | How this was established |

**A measurement with a `first_breach` but no attribution MUST NOT be cited as
evidence about the design.** `undetermined` is an honest answer; a confident wrong
attribution is not.
