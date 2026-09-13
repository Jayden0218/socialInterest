# Running the backend on your own machine

The product's data and photographs live in Supabase. This runs the one piece
that has to be a **running process** — the API — on your laptop, and lets your
phone reach it over your own Wi-Fi.

**What this is not: a deployment.** Close the lid and the backend is gone. That
is the whole trade, and it is a reasonable one while you are building. The
hosted path (`specs/010-managed-backend`, R8a) is what removes it.

---

## Once, to set up

```bash
brew install node@22 pnpm ffmpeg        # macOS
pnpm install
cp .env.local.example .env.local        # then fill it in
```

`.env.local` is gitignored and must stay that way. What goes in it:

| | Where it comes from |
|---|---|
| `DATABASE_URL` | Supabase → Connect → **Session pooler** |
| `S3_ENDPOINT`, `S3_REGION` | Supabase → Storage → S3 access keys |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | same page — **the secret shows once** |
| `MEDIA_BUCKET` | `sih-media`, and the bucket must be **private** |
| `LOCAL_JWT_SECRET` | `openssl rand -hex 32`, generated once and then left alone |

**Session pooler, not the other two.** The direct connection is IPv6-only and
home networks are IPv4; the transaction pooler breaks a long-lived connection
pool, which is exactly what the API opens.

**The bucket must be private.** Every image URL is signed for fifteen minutes and
issued only *after* the visibility boundary has decided this viewer may see that
post. A public bucket hands out permanent unguarded links to private
photographs — which is 006/R4b's defect, inverted.

### Why ffmpeg

It is the one native dependency, and it is on the publish path rather than
beside it:

- **strips GPS out of every photograph** (`-map_metadata -1`) — FR-010, done
  server-side because a modified client simply skips a client-side strip
- **reads image dimensions**, so a card can reserve space before the image loads
- **poster frame and transcode** for video (FR-009)

Without it nothing publishes at all: `MediaDispatchService` leaves the post
`pending`, and a pending post is visible only to its author — which is
character-for-character the state spec 002 found the whole product stuck in.

---

## Every time

```bash
pnpm laptop
```

It checks its prerequisites and names the one that is missing, prepares the
Supabase schema (safe to re-run), and prints the address:

```
  │  Server address, to type into the app once:
  │      http://192.168.1.42:3000/v1
```

**Not `localhost`.** To the phone, `localhost` is the phone. That is the same
class of mistake as signing media URLs against `127.0.0.1`, where the emulator
resolved it to its own loopback and every image came up blank.

Your phone must be on the same Wi-Fi. `Ctrl-C` stops it.

---

## On the phone

1. Install the APK.
2. Sign-in screen → paste the address above into the top field, the token into
   the second.
3. That is the last time you type it: the app stores the address
   (`sih.backend.url`) and the token, and both survive a relaunch.

**Set a static IP on the laptop**, or reserve its lease on the router. A DHCP
lease that moves puts the address field back, and the symptom — an app that
worked yesterday and now cannot reach anything — looks like a product failure
and is not one.

Once the address is stable, building the APK with
`EXPO_PUBLIC_API_BASE_URL=http://<that address>/v1` compiles it in and the field
disappears entirely.

---

## When it does not work

| Symptom | Cause |
|---|---|
| "Could not reach …" on the phone | different Wi-Fi, or the laptop asleep. Check `curl http://<ip>:3000/v1/health` from the laptop first |
| The app reaches it but images are blank | `S3_PUBLIC_ENDPOINT` signed for the wrong host. A signature covers the host, so the URL cannot be repaired by rewriting it |
| A post stays "processing" forever | ffmpeg. `ffmpeg -version` on the laptop |
| `too many clients already` | something else is holding Supabase connections. `DATABASE_POOL_MAX` defaults to 8 |
