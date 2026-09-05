# MediaConvert smoke test

**Run this before launch. A green `bench:transcode` does not substitute for it.**

## Why this document exists

Research §D9 records one genuine divergence in the runtime profiles. Every other
local stand-in is an emulation — MinIO speaks the S3 API, DynamoDB Local speaks
the DynamoDB API, so a pass locally means the same code path works in AWS.

`MediaProcessor` is different. ffmpeg and AWS Elemental MediaConvert are two
**different implementations** of the same port, not one emulating the other.
Constitution principle V (*Emulation Is Not Evidence*) exists for exactly this
case, and this procedure is the stated verification plan it requires.

What differs, concretely:

| | ffmpeg (local) | MediaConvert (aws) |
|---|---|---|
| Encoder defaults | libx264 with our flags | Service presets |
| HLS segmenting | `-hls_time 4`, VOD playlist | Preset-driven, may differ in boundaries |
| Job model | Submit-then-poll, in-process | Submit-then-poll, service queue |
| Failure modes | Process exit, container missing | Job errors, quota limits, IAM denials |
| Poster frame | `-ss 00:00:01 -vframes 1` | Frame-capture output group |

The failure this guards against is not "video is broken" — that would be
obvious. It is a subtle mismatch: renditions that play on one platform but not
another, a poster frame at a different timestamp, or an HLS playlist whose
segment boundaries break seeking.

## Prerequisites

- A **staging** AWS account. Not production, and not the account any real data
  lives in.
- Explicit approval to provision, per `plan.md` § Cost Posture. **This procedure
  provisions billable resources** — MediaConvert bills per output minute, and the
  S3 and CloudFront usage bills too.
- The stack synthesised from `infra/` and deployed to that account.
- `RUNTIME_PROFILE=aws` with credentials for it.

## Procedure

1. **Fixture set.** Use the same clips `bench:transcode` uses, plus three the
   local path never sees:
   - 5s, 30s, 60s, 180s (the FR-005 cap) at 1280×720
   - A clip with a non-standard aspect ratio (e.g. 9:16 vertical)
   - A clip with variable frame rate, as phone cameras produce
   - A clip with an audio track (the local fixtures are silent)

2. **Upload and publish** each through the real API, exactly as a client would.

3. **Assert, per clip:**
   - The post reaches `processingState: ready`
   - A poster frame exists and is a decodable image
   - The HLS playlist parses and every referenced segment resolves
   - Playback works in **both** an iOS and an Android client — not just a
     desktop browser, which is more forgiving of playlist quirks
   - Seeking to the midpoint works and lands within a second

4. **Time it.** SC-003 requires playable within 60 seconds of upload finishing
   for 95% of uploads. Record the distribution, not the mean. **If the 180s clip
   misses the budget, the FR-005 duration cap must come down** — the cap in
   `apps/api/src/config/media.limits.ts` was chosen against this budget and
   documents that dependency.

5. **Failure paths.** Deliberately submit a corrupt file and a clip exceeding the
   cap. Confirm the job fails cleanly, the media item is marked `failed`, the
   post does not become `ready`, and the author is not left waiting forever.

## Recording the result

Write the outcome into `specs/001-interest-media-sharing/validation-report.md`
with the date, the account, the measured distribution, and any divergence found.

**If a divergence is found, it belongs in research §D9** alongside the others, so
the next person does not rediscover it.

## What this does not cover

Cost. MediaConvert bills per output minute and this procedure produces a handful
of minutes. Before launch, model the cost at expected volume separately — a
transcode pipeline that works but costs more than the product earns is still a
problem, and it is not one this test can see.
