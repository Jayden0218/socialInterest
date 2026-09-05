# Load Measurement — <date>

Fields per `specs/002-production-readiness/data-model.md` § Load Measurement.

| Field | Value |
|---|---|
| **transport** | **Required.** `http` or `in-process`. Feature 001's figures were in-process and were read as though they were not |
| **datastore** | **Required.** What the reads actually hit — `dynamodb-local` or provisioned |
| version | Commit measured |
| date | |

## Latency by concurrency

| Concurrency | p50 | p95 | p99 | Throughput | Errors |
|---|---|---|---|---|---|
| 1 | | | | | |
| 10 | | | | | |
| 50 | | | | | |
| 100 | | | | | |

| Field | Value |
|---|---|
| first_breach | Concurrency at which p95 first exceeds 2000 ms |
| **bottleneck** | **Required.** `generator` / `application` / `datastore` / `undetermined` |
| **bottleneck_evidence** | **Required.** How the attribution was established |

> A measurement reporting a `first_breach` without a `bottleneck` attribution **MUST NOT** be
> cited as evidence about the design. `undetermined` is a permitted and honest value; a
> confident wrong attribution is not. This rule exists because 001's 11.8s figure was cited
> as evidence about read-time fan-in when it could not distinguish the design from the emulator.
