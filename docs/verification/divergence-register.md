# Divergence register

Every capability where the local stand-in and the production service are
**different implementations** rather than emulations of one another. This is the
artifact that discharges constitution Principle V.

A capability whose local tool speaks the same API as production does NOT belong
here. DynamoDB is the standing example: DynamoDB Local speaks the DynamoDB API,
so no divergence exists and no adapter was invented (research 001/D9). Adding a
spurious row is as much a defect as omitting a real one — it makes completeness
unfalsifiable.

`implementation` records what production code exists **today**, separately from
whether it has been verified. An entry with no implementation cannot be verified,
only written first; reporting it as merely "unverified" would suggest there is
something to run.

| id | capability | local | production | implementation | status | last run |
|---|---|---|---|---|---|---|
| D-1 | Object store | MinIO | S3 | `real` — `s3-object-store.ts` uses `@aws-sdk/client-s3`, never executed | `unverified` | — |
| D-2 | Transcode | ffmpeg container | MediaConvert | `real` — implemented 002/T073, never executed | `unverified` | — |
| D-3 | Identity | local JWT issuer | Cognito | `real` — implemented 002/T074, never executed | `unverified` | — |
| D-4 | Media delivery | direct MinIO read | CDN | `real` — implemented 002/T075, never executed | `unverified` | — |

## Why each can differ

- **D-1** — presign semantics, consistency model, and error taxonomy. A key that
  reads back immediately from MinIO may not from S3.
- **D-2** — queueing and job latency, codec defaults, HLS segmenting, failure
  modes. Directly gates `002/SC-005` (video playable within 60s). Its runbook also
  proves FR-017: location metadata absent by the time anyone can read the media.
- **D-3** — token shape, claims, expiry and refresh.
- **D-4** — signed-URL scope and expiry, cache behaviour, and whether an
  unauthorised viewer can fetch an object directly.

## Status rules

- `verified` is scoped to the commit in its Verification Run. When that commit is
  no longer current the status becomes `stale`, never `verified`.
- A `failed` status is not cleared by re-running until the cause is understood.
  Re-running until it passes produces a record that means nothing.
- **No verification has been performed.** All four require provisioned
  infrastructure, which requires the project owner's specific approval
  (`approvals.md`). None has been granted.
