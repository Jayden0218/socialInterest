# Running the backend on your own machine

The product's data and photographs live in Supabase. This runs the one piece
that has to be a **running process** — the API — on your laptop, and lets your
phone reach it over your own Wi-Fi.

**What this is not: a deployment.** Close the lid and the backend is gone. That
is the whole trade, and it is a reasonable one while you are building. The
hosted path (`specs/010-managed-backend`, R8a) is what removes it.

---

## From a Mac with nothing on it

```bash
# 1. Homebrew, if you do not have it. Follow the "Next steps" it prints at the
#    end — on Apple Silicon it tells you to add brew to your PATH, and nothing
#    afterwards works until you do.
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. The tools. `node` rather than `node@22`: the versioned formula is keg-only
#    and needs its own PATH entry, and this only asks for 22 or newer.
brew install node pnpm ffmpeg gh

# 3. The repository. It is private, so `gh auth login` first — browser, HTTPS.
gh auth login
gh repo clone Jayden0218/SocialLetInterest ~/socialinterest
cd ~/socialinterest
git checkout claude/pensive-goldberg-jjjni5

# 4. Dependencies.
pnpm install

# 5. Configuration, then fill it in.
cp .env.local.example .env.local
openssl rand -hex 32          # paste into LOCAL_JWT_SECRET
open -e .env.local
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

## Check it before you run it

```bash
pnpm doctor
```

Runs every prerequisite against your real configuration and names the one thing
to change. It drives the PRODUCT'S OWN adapter rather than curling the endpoints
— two checks written from the same assumption agree with each other and neither
agrees with the product, which is how feature 001 shipped green and broken.

What it proves, in order: ffmpeg and ffprobe exist; the database answers; the
schema is there; the bucket accepts a write and reads it back; **the bucket is
private** — an unsigned read is refused; and a presigned upload succeeds, which
is the exact path a phone takes to upload a photograph.

The privacy check is worth more than it looks. Every image URL the API issues is
signed for fifteen minutes and issued only *after* the visibility boundary has
allowed that viewer. A public bucket makes that decision decorative: anyone
holding the key reads the file, forever, and the boundary has been bypassed
rather than failed.

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

## Signing in — just open the app

**Since 011 you create an account in the app.** Tap **Create an account**, enter
an email address, a password, a handle and a name, and you are in. Sign in again
later with the same address and password, on this phone or another one. The app
stays signed in across relaunches, and **Sign out** is in Edit profile.

The email address is never sent anywhere — there is no mail provider configured
and password reset is not built yet (011/US4). It identifies the account and
nothing else, so an address that does not exist works fine. **The consequence is
worth knowing: a forgotten password is currently unrecoverable**, and the app
deliberately offers no control that pretends otherwise.

```bash
pnpm seed:demo "<a token>"    # six people, fourteen posts, comments, places
```

The demo seed still wants a token, because it is an HTTP client acting as a
person rather than something signing in. `pnpm mint:token` below is how to get one.

---

## A token, for the seeder and for device passes

**This is no longer how you get into the app.** It was, until 011, and it was
never a product: the first screen asked for a 244-character string a developer
had minted. It remains the right tool for two jobs that are not signing in —
seeding the demo data, and provisioning an account for the emulator journeys.

`pnpm laptop` holds the terminal. In a **second tab**, from the same directory:

```bash
pnpm mint:token                       # prints a QR code, the address and the token
```

`pnpm mint:token` prints **a QR code holding the token**, then the address and token
as text. Scan the code with the phone's **ordinary camera app — not Expo**:
Expo Go's scanner expects a dev-server URL and will not help.

The **address** is short — type it. The code deliberately does not carry it:
nothing on the phone parses a QR, so a payload with two values in it means
picking them apart by hand on a phone screen, which is worse than typing 27
characters. A QR here is a clipboard, and a clipboard should hold one thing.

On the laptop you can skip the phone entirely for the token:

```bash
pnpm --silent mint:token | pbcopy
```

The token alone goes to stdout and everything else to stderr, so that pipe gets
the token and not the banner around it. It is ~244 characters: reading it off a
screen and typing it into a phone is a step that gets done wrong three times and
then abandoned, and "invalid token" looks the same whether you mistyped it or
misconfigured the backend.

**It lasts 30 days**, not the two hours a CI device pass gets. Two hours on a
laptop signs the phone out over lunch, and "the app stopped working" is
indistinguishable from the backend being down. Override with `TOKEN_TTL`.

The seed is not decoration. A fresh backend holds twelve catalogue interests and
nothing else, so the first screen after signing in is an empty feed — which reads
as a broken app and is not one.

**A signed token is not an identity**, which is why `pnpm mint:token` exists rather
than a JWT one-liner. There is no signup endpoint on this profile: the profile
row the token refers to has to exist, or `GET /v1/me` answers 404 and sign-in
fails on the device.

If the seed fails it names the step it failed on. Anything from `setting
avatars` onward means the API is fine and object storage is not.

## On the phone

1. Install the APK.
2. Sign-in screen → paste the address `pnpm laptop` printed into the top field,
   and the token from `pnpm mint:token` into the second.
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
