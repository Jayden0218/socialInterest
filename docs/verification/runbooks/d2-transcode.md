# D-2 — Transcode (ffmpeg → MediaConvert)

**⛔ Requires an Approval Record.**

This is the divergence most likely to be wrong, because the two implementations
share nothing but an interface.

## What would count as proof

1. **`002/SC-005`** — a published video is playable within 60 seconds of the
   upload finishing, for 95% of uploads. Measure at least 20 clips spanning the
   accepted duration range up to the 180s cap.
2. **`002/FR-017`** — location metadata is absent by the time anyone can read the
   media, exercised through the path a modified client takes: upload a file
   carrying real GPS EXIF, then fetch the derived object directly and inspect it.
   A client-side strip is not a guarantee (Principle III).
3. A failed job marks the media item `failed` and the post never reaches `ready`.
   An unprocessed original must never be reachable by a reader.
4. Poster frame and renditions are produced for the same inputs the local path
   handles.

Note that (2) is part of this runbook deliberately. The metadata strip lives in
the media processor, so a MediaConvert path that transcodes correctly but does not
strip would satisfy a naive reading of "transcode works" while breaking a privacy
guarantee.

## Steps

1. Provision under the approved tag.
2. Run the video publish journey against `RUNTIME_PROFILE=aws`.
3. Measure (1) over the sample; exercise (2)–(4).
4. Record in `../runs/<date>-D-2.md`, then tear down separately.
