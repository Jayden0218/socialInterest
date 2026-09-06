# Load Measurement — <date>

Copy this file, fill it in, never edit it after the run.

| Field | Value | Required? |
|---|---|---|
| transport | `http` or `in-process` | **Yes** |
| datastore | What the reads actually hit, **and whether it is the same software a deployment would run** | **Yes** |
| version | Commit measured | **Yes** |
| date | | **Yes** |

`transport` is mandatory because feature 001's headline figure was taken
in-process and read as though it were not.

`datastore` must say whether it was the real thing or a stand-in. A measurement whose
binding constraint is a development stand-in is a measurement **of that stand-in** and must
be reported as such — never as a statement about the product (003/FR-013). 001 reported an
emulator's p95 as a property of the design, and it drove a proposal to build a hybrid that
turned out to be unwarranted.

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
