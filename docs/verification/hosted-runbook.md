# The hosted runbook — Render + Supabase

**010/T029.** How the API gets a permanent public address, and what is owed once it has one.

> ## THE SERVICE IS DEPLOYED AND RUNNING — 2026-09-16
>
> `https://socialinterest-api.onrender.com`, service `srv-dal9qdqd0e5s7391setg`,
> Oregon, free plan, Docker runtime, branch `claude/pensive-goldberg-jjjni5`.
> Boot line, read from Render's own logs rather than assumed:
>
> ```
> [InMemoryCatalogueCache] catalogue loaded: 0 active interests (0 total)
> [NestApplication] Nest application successfully started  +145ms
> [bootstrap] API listening on 0.0.0.0:10000 (profile=local)
> ==> Your service is live
> ```
>
> **What that boot proves, and it is more than it looks:** the image built with
> ffmpeg (the `apt-get` layer the Dockerfile carried as UNVERIFIED — Debian answers
> 403 from the sandbox, and answered normally from Render, fetching 9,378 kB);
> `tsx` resolved `experimentalDecorators`, so `COPY tsconfig.base.json` was right;
> the service bound **10000, the injected `PORT`, not 3000**, so the `API_PORT` trap
> was avoided; and the datastore query that crashed the previous boot now returns.
>
> **What it does NOT prove, and must be reported that way.** THE ADDRESS HAS NOT BEEN
> FETCHED FROM ANYWHERE. This sandbox's egress policy refuses `onrender.com`
> (`connect_rejected`), so no HTTP response has been observed by the party writing
> this file — only Render's own claim that the service is live. That is precisely the
> Principle V distinction, and it is why T030 below is still open.
>
> The measurements the deploy owes — **T030, T031, T032, T033** — remain open, with
> what has been measured recorded exactly and no more.

---

## 1. What is actually being deployed: ONE service

Checked rather than assumed, because it decides whether the free tier is enough.

`apps/workers` is a **library, not a service**. The API imports its handlers directly —
`media-dispatch.service.ts:2` calls `handleImageJob`/`handleVideoJob`,
`interest-job.service.ts:7` calls `handleInterestJob`, `account-deletion.service.ts:5`
calls `handleAccountDeletion` — so there is no background worker to host. There is also
no cron and no `setInterval` anywhere in `apps/api/src`: nothing is waiting for a
scheduler.

**One web service is the whole backend.** Plus two managed dependencies that are not
Render's problem: Postgres and object storage.

### Why the free tier's four limits do not block it

| Render free limit | What it costs this app |
|---|---|
| No SSH | Nothing. The only one-off steps target Supabase, not Render — §2 and §3 |
| No one-off jobs | Nothing, same reason |
| No persistent disk | Nothing. The API writes nothing durable to disk: Postgres is external, media goes to object storage, and ffmpeg works in `mkdtemp(tmpdir())` and `rm`s it (`ffmpeg-media-processor.ts:75`) |
| No scaling | Nothing — and single-instance is the configuration the code is *correct* under. `InMemoryCatalogueCache` is per-process; two instances would each hold their own copy and drift |
| **Spins down after 15 idle minutes** | **This one is real.** T032 measures it |

**009/research.md ruled Render out for reasons that have since expired** — the media
adapter no longer needs a Docker socket (010/T026) and the app needs no disk. That row
is annotated in place rather than deleted, because what expired is the instructive part.

---

## 2. Postgres — Supabase

### 2a. The schema

The schema is one table and five partial indexes. Two ways in, and **the first is
preferred because it reports what it did**:

```bash
DATABASE_URL='<the Supabase connection string>' \
  pnpm --filter @sih/infra db:create-local-pg
```

It prints `items exists with N indexes: …` — a count, deliberately, because a
`create … if not exists` that silently did nothing looks identical to one that worked.
**Expect 6** (the primary key plus `items_gsi1` … `items_gsi5`). Anything less means
the statement did not do what it looks like it did.

Do **not** pass `--recreate` against a database holding real data: it drops `items`.

If `pnpm` cannot reach the database from wherever you are, the fallback is to paste the
equivalent SQL into Supabase's own SQL editor. `infra/scripts/create-local-schema.ts:40`
is the authoritative text; the partial `where gsiNpk is not null` clauses are **not
optional** — they are what reproduces DynamoDB's sparse-index behaviour, and the
contract calls getting it wrong out by name.

### 2a-bis. ROW LEVEL SECURITY IS REQUIRED, and Supabase will offer to skip it

Running the schema in Supabase's SQL editor raises a dialog offering **Run without
RLS** or **Run and enable RLS**. **Take "Run and enable RLS".** This is not a
formality and the wrong button fails silently forever.

Supabase exposes every `public` schema table through PostgREST at
`https://<ref>.supabase.co/rest/v1/`, authenticated with the **`anon` key — which is
designed to be public and ships inside client apps.** `items` is the whole datastore:
every post, person, message, block, report and credential row, in one table. Without
RLS that REST endpoint is a second, unguarded read path straight into the raw rows,
and it consults nothing on the way:

- **Principle II** says one `VisibilityFilter` and every read path goes through it. A
  PostgREST query is a read path that goes through none of it.
- **Principle III** says privacy is enforced server-side and tested via the path a
  hostile client would take. This IS that path, and it would be wide open.

Enabling it does not affect the API. The service connects as the `postgres` role,
which owns the table, and Postgres exempts a table's owner from RLS unless `FORCE ROW
LEVEL SECURITY` is set. RLS with **no policies** therefore means "deny everything" for
`anon` and `authenticated` and "unchanged" for the owner — which is exactly the
division wanted.

**Verified 2026-09-16 by the boot that followed**: with RLS enabled, the API's own
reads work normally. If it had been wrong, the next boot would have thrown a
permissions error in place of the missing-table one — which is the direction to fail
in, because the other button fails open and nothing ever says so.

### 2b. The connection string

Use Supabase's **pooler** connection string, not the direct one. A free managed database
has a connection ceiling well below what a pool will happily open, and exhausting it does
not fail the deploy — it fails whichever request is unlucky.

Set `DATABASE_POOL_MAX` under the provider's stated limit.

---

## 3. Object storage — Supabase Storage (S3-compatible)

Create a bucket named to match `MEDIA_BUCKET` (default `sih-media`) and issue S3 access
keys from the storage settings.

**The bucket must be PRIVATE.** The app issues presigned GET urls inside
`PostQueryService.toMediaItem`, which runs only *after* `VisibilityFilter` has decided
this viewer may see this post. A public bucket would make every object readable by URL
to anyone holding it, which is the guarantee `N-04` exists to check — and 006 already
recorded getting this wrong once.

`S3_PUBLIC_ENDPOINT` and `S3_ENDPOINT` are the same value here, because the client and
the service reach storage at the same address. They differ only where they don't — an
emulator run being the case that taught it, since a presigned signature covers the Host
header and so a URL cannot be rewritten after signing.

---

## 4. Render — the web service

Deploy **from the Dockerfile**, not the native Node runtime. `Dockerfile:47`
`apt-get install`s ffmpeg; Render's native Node runtime has no ffmpeg, and a Node service
there would accept an upload, fail every transcode and leave every post `pending` — which
is 002's fourth defect exactly.

### Environment variables

Every variable the API reads, enumerated from the source rather than remembered.

| Variable | Hosted value | Note |
|---|---|---|
| `RUNTIME_PROFILE` | `local` | The only accepted value; anything else refuses to boot and says so |
| `DATABASE_URL` | Supabase pooler string | No default. Its absence is a refusal, not a fallback |
| `DATABASE_SSL` | `true` | Required by managed Postgres |
| `DATABASE_POOL_MAX` | e.g. `4` | Default 8. Size under the provider's ceiling |
| `LOCAL_JWT_SECRET` | `openssl rand -hex 32` | **No default, and the old published value is refused by name** (003/FR-007) |
| `S3_ENDPOINT` | Supabase S3 endpoint | |
| `S3_PUBLIC_ENDPOINT` | same as above | Differs only where client and service addresses differ |
| `S3_REGION` | the project's region | |
| `MEDIA_BUCKET` | `sih-media` | |
| `S3_ACCESS_KEY_ID` | from Supabase | |
| `S3_SECRET_ACCESS_KEY` | from Supabase | |
| `S3_FORCE_PATH_STYLE` | `true` | |
| `JWT_ISSUER` | `sih-local` | Default; fine as is |
| `TABLE_NAME` | — | Unused by this engine; the default is fine |
| `FFMPEG_PATH` / `FFPROBE_PATH` | — | Leave unset. The image puts both on `PATH` |
| `MEDIA_DISPATCH_ON_CREATE` | — | Defaults `true`, which is what you want. Setting it `false` leaves every post `pending` forever, visible only to its author |
| `PORT` | injected by Render | Do not set it yourself |

### THE TRAP: DO NOT SET `API_PORT`

`.env.example` ships `API_PORT=3000`, and copying that file's contents into Render's
environment is the obvious move. **It would break the deploy in the way that is hardest
to diagnose.**

`configuration.ts:127` reads `API_PORT` **first**, then `PORT`, then 3000. Set
`API_PORT=3000` and the service binds 3000 while Render routes to whatever `$PORT` says.
The container is healthy, the logs are clean, nothing went wrong from the server's point
of view — and the address answers nothing. `main.ts`'s own bind comment describes this
failure two files away.

Leave `API_PORT` unset. The boot line names the port it actually bound; read it.

---

## 5. Point the app at it

**No APK rebuild is needed.** `apps/mobile/src/config.ts` reads
`EXPO_PUBLIC_API_BASE_URL` as a **default, not a pin** — `ADDRESS_IS_COMPILED_IN` is
false when it was never set — and the sign-in screen carries an address field. A product
that cannot be repaired from inside itself is worse than one that asks a question.

The address is `https://<service>.onrender.com/v1` — note the `/v1`.

Rebuilding with `EXPO_PUBLIC_API_BASE_URL` set is still worth doing once the address is
final, so nobody has to type it. The permanent `onrender.com` hostname is exactly what
makes that a one-time step rather than a daily one.

---

## 6. What the deploy owes — ALL NOT RUN

| Task | Criterion | Result |
|---|---|---|
| T029 | The API has a permanent public address | **PASS** — `https://socialinterest-api.onrender.com`, deploy `dep-dala59u7bikc73et9jr0`, live 2026-09-16T14:08:35Z |
| T030 | Encrypted, and reachable from a phone on an unrelated network (FR-011, FR-012) | **NOT RUN.** The address is `https://`, and Render reports the service live — but **no HTTP response has been observed from outside Render**, because this sandbox's egress refuses `onrender.com`. Reachability from a phone is untested |
| T031 | SC-007: publishing a post carrying a photograph completes in **under 30 s** | **not run** — measured: `______` |
| T032 | SC-008: after 24 h of no use, the first request is served in **under 60 s** | **not run** — measured: `______` |
| T033 | Does 512 MB and 0.1 vCPU transcode **video**? | **not run.** Idle baseline measured: **185 MB of 512 MB** (193,859,580 / 536,870,900 bytes, 2026-09-16T14:09Z), ~326 MB headroom. That is the BASELINE, not the answer — ffmpeg runs as a subprocess against the same cgroup limit, and no transcode has been attempted |

**T032 and T033 are real measurements with a real chance of failing, and must be reported
as failures if they fail.** R8a prices the spin-up at 30–60 s, which puts SC-008 at the
boundary rather than comfortably inside it. R8a records the transcode question as
unmeasured in as many words: *"Node plus a transcode of a real video may not fit.
Photographs will."* A documented limit is an acceptable outcome. A silent failure is not.

One thing measured here that bears on T032: **`apps/mobile/src/data/client.ts` sets no
timeout and no `AbortController`**, so the app inherits the platform's default rather
than one anybody chose. A cold start is therefore raced against a number nobody in this
repository has picked. That is an unstated limit, which is the kind you meet as a bug.

## 7. What a green deploy would still not close

- **N-04** — that media is not served to a viewer who may not see it — is verified against
  MinIO in CI. A hosted run against Supabase Storage is a *different* implementation and
  Principle V applies: it would need its own verification and a divergence entry, not an
  inherited pass.
- **`D-010-1`** in the divergence register stays open: pooling, latency and free-tier
  ceilings all differ from anything measured locally.
- **002/SC-002** (10,000 concurrent) is unchanged and still unverified.
