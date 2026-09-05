# D-1 — Object store (MinIO → S3)

**⛔ Requires an Approval Record before any step below is run.** Nothing here may
start without one recorded in `../approvals.md`.

## What would count as proof

Stated before the run, because deciding what counts after seeing the result is not
verification:

1. A presigned PUT issued by `S3ObjectStore` accepts the bytes and rejects a
   request whose content-type does not match the one signed.
2. An object written through the presigned target is readable by the API
   immediately afterwards — the read-after-write the local path gives for free.
3. Deleting the original after derivation actually removes it (the un-stripped
   bytes must not linger — FR-010).
4. The error taxonomy maps to the same problem+json responses the local path
   produces: a missing key is a 404, not a 500.

## Steps

1. Provision a bucket under the approved tag. Record the tag in the run.
2. `RUNTIME_PROFILE=aws` with the bucket configured; run the upload and publish
   journeys (J-04, J-05) against it.
3. Exercise (1)–(4) explicitly, including the negative cases.
4. Record the outcome in `../runs/<date>-D-1.md`.
5. Tear down as a separate invocation: `pnpm --filter @sih/infra verify:teardown --tag <tag>`.

## Recording

Use `../runs/TEMPLATE-verification-run.md`. A `fail` must say what differed, not
just that it failed. Record the cost even when it is zero.
