# Research: Disposable Session Server

**Feature**: 009 | **Date**: 2026-09-12 | **Plan**: [plan.md](./plan.md)

Ten decisions. Three of them were changed by reading the build rather than by reasoning
about it, and those are marked. One is **unverified** and says so.

---

## R1 — A session runs on a GitHub-hosted runner

**Decision**: The session backend runs as a `workflow_dispatch` job in this repository.

**Rationale**: FR-009 forbids a cloud account and a payment method. That eliminates every
hosting option evaluated, because each of the serious ones requires a card even where it
never charges — Oracle takes one for identity verification and refuses prepaid cards,
Cloudflare requires one to enable object storage even on the free tier, and AWS requires one.
What remains is compute the owner already has: GitHub Actions.

**CORRECTED 2026-09-12, and the first version of this paragraph was wrong.** It said the
repository is public and that runners therefore cost nothing, taken from `CLAUDE.md`'s note
of 2026-09-07 — a note whose own closing line is *"check the facts before repeating either
claim; both halves of this one expired within a day."* They expired again. The API answers
`visibility: private`, `private: true`.

So a session is **free but metered**: GitHub Free includes **2,000 Linux minutes a month** on
private repositories, and with no payment method on file the default spending limit is $0, so
jobs **stop** rather than bill. FR-009 still holds — nothing is charged and no card is needed
— but the resource is finite and shared with CI and the emulator job:

| Session length | Minutes | Roughly per month, if nothing else ran |
|---|---|---|
| 30 minutes | 30 | 66 |
| 1 hour | 60 | 33 |
| 2 hours | 120 | 16 |

This is not a hypothetical constraint. `CLAUDE.md` records every workflow failing on
2026-09-06 with *"spending limit needs to be increased"* — which happened while the
repository was private, which it is again.

**Private also removes a leak this design would otherwise have had, and that was luck rather
than judgement.** Actions logs and job summaries on a PUBLIC repository are readable by
anyone. The descriptor is written to `$GITHUB_STEP_SUMMARY` and carries a working credential,
so on a public repository it would have been visible to anyone watching the Actions tab for
as long as the session lived. Nothing in the design noticed; the repository's visibility is
doing that work. If it is ever made public, the descriptor must stop carrying the token.

The runner is also the only candidate that needs **no code changes at all**: the media
adapter shells out to `docker run`, which needs a Docker daemon. Every platform-as-a-service
option would have required rewriting it; a runner has one.

**Alternatives considered**:

| Option | Why not |
|---|---|
| Oracle Always Free ARM VM | Best technical fit — always-on, permanent address, zero code change, and `linuxserver/ffmpeg` and `amazon/dynamodb-local` both publish `linux/arm64`. **Requires a card.** Ruled out by FR-009, not by merit. Revisit if the constraint changes |
| Render / Koyeb / Cloud Run | No Docker socket, so the media path cannot run. Render's free tier also has no persistent disk and sleeps after 15 idle minutes |
| The owner's own machine | Stated constraint: it is out of memory and cannot run the stack |
| This sandbox | Cannot accept inbound connections; the tunnel is denied at the egress layer (`403 host_not_allowed`), and the container is ephemeral |

**Cost of the choice, stated plainly**: a job is capped at **6 hours** on a GitHub-hosted
runner and the cap is hard. Sessions are therefore ephemeral by construction, not by
preference.

---

## R2 — Reachability is a Cloudflare quick tunnel — **and this is UNVERIFIED**

**Decision**: Two `cloudflared` quick tunnels, one for the API and one for media. No account,
no DNS, no certificate, a random `*.trycloudflare.com` address per run, HTTPS terminated at
Cloudflare's edge.

**Rationale**: It is the only reachability mechanism that satisfies FR-009 (no account) and
FR-011 (encrypted) at once. It gives the encrypted connection for free, which also means the
phone is not asked to accept cleartext from the public internet.

**Status: unverified, deliberately recorded as such.** `CLAUDE.md` records quick tunnels
failing *in this sandbox*. That is a fact about **this environment's egress allowlist**, not
about GitHub's runners: the failure is `403 host_not_allowed` from the agent proxy, because
cloudflared's edge link is raw TCP/QUIC and cannot use an HTTPS proxy. A runner has open
egress and no such proxy. There are also established, maintained Actions for installing
`cloudflared`, which is weak evidence that people do this.

I expect it to work. **I have not observed it**, and Principle V says a green result
elsewhere is not evidence about the path that ships. The first dispatch is the experiment,
and the plan's gate forbids claiming the feature works before then.

**Observed here 2026-09-12, and it sharpens the claim rather than settling it.** Running the
pinned client in this sandbox:

```
14:29:40 INF Requesting new quick Tunnel on trycloudflare.com...
14:29:43 INF |  https://issue-fort-browsers-hope.trycloudflare.com  |
14:29:59 ERR Unable to establish connection with Cloudflare edge
             error="DialContext error: dial tcp 198.41.192.227:7844: i/o timeout"
```

Two facts worth separating, because `CLAUDE.md` runs them together. **Provisioning works**:
the HTTPS call to `trycloudflare.com` goes through the agent proxy and returns a real
address. **The edge dial does not**: it is raw TCP to port 7844, cannot use an HTTPS proxy,
goes direct, and times out — then retries forever. `--protocol http2` does not help, because
that governs the transport *inside* the edge connection, not how it is dialled. A runner has
no such proxy and no such restriction, which is why this is evidence about the sandbox and
not about GitHub.

**It also found a defect in the bring-up, which is the whole argument for looking.** The
address is issued in three seconds and the edge fails sixteen seconds later. The first
version of `open_tunnel` returned as soon as it saw a URL, so it would have emitted a
descriptor naming an address that never becomes reachable — a session that looks ready and
is not, which is the failure the descriptor contract exists to prevent, arriving by a route
the contract did not name. It now requires a registered connection **and** an end-to-end
fetch through the public address before it returns.

**Fallbacks, in order, if the first dispatch fails**: `localtunnel` (npm, no account),
`pinggy`, then `ngrok` (free account, still no card). The contract in
`contracts/session-descriptor.md` is written against *addresses*, not against Cloudflare, so
swapping the provider changes one script and nothing else.

**Any fallback must preserve FR-011.** `localtunnel` and self-hosted alternatives can serve
plaintext; the bring-up asserts encryption rather than trusting the provider, so swapping one
in cannot quietly drop the guarantee.

**Pin the version.** Quick tunnels are explicitly a temporary-use, rate-limited facility, and
recent `cloudflared` releases have broken older configurations. A floating version puts the
ability to start a session outside this repository's control — the same argument
`docker-compose.yml` already makes for pinning the MinIO image.

---

## R3 — The media address must exist before the API starts — **the governing constraint**

**Decision**: The bring-up order is fixed and non-negotiable:

```
backing services up  →  media tunnel up  →  capture media address
                     →  START API with S3_PUBLIC_ENDPOINT = media address
                     →  api tunnel up    →  capture api address
                     →  mint credential  →  emit descriptor
```

**Rationale**: This is not a preference, it is arithmetic. `MinioObjectStore` holds a second
S3 client bound to `publicEndpoint` purely to sign URLs a client will follow, because **a
presigned signature covers the host**. A URL signed against the service's own address cannot
have its host rewritten afterwards — the signature stops matching. So the address the phone
will use has to be known at the moment the API starts, and a tunnel address is not known
until the tunnel is up.

**This project has paid for this twice.** Run 13 created three upload targets and issued no
publish at all, because the bytes never landed. Run 25's third defect is the same fact from
the other direction. `configuration.ts` carries a comment about it that ends: *"Any hosted
deployment where object storage sits behind a different public address needs this distinction
too."* This feature is that deployment.

**The symptom if it is got wrong is the reason it is a contract**: the app works, and every
image is blank. That reads as a defect in the product and is not one — which is precisely
the class of failure that costs runs, so the rule is written in
`contracts/session-descriptor.md` with a check that fails the bring-up rather than shipping a
blank-imaged session.

**Alternatives considered**: rewriting URLs after signing (impossible, above); serving media
through the same tunnel on a path prefix (a quick tunnel maps to one origin, and splitting by
path would put a rewriting proxy in the media path — more moving parts in exactly the place
that already broke twice); making the API re-sign lazily once the address is known (the same
complexity, plus a window where issued URLs are wrong).

---

## R4 — The device needs a key/value store, because it has never had one — **found by reading**

**Decision**: Add a device backing store for `KeyValueStore` using
`@react-native-async-storage/async-storage`, and use it for both the credential and the
backend address.

**Rationale**: The plan assumed this seam already worked on a device. It does not.
`browserKeyValueStore()` is the **only** implementation of `KeyValueStore`; it reads
`globalThis.localStorage` and returns `null` anywhere else. So on a device
`defaultTokenStore()` returns `undefined`, `createAppData` falls back to an in-memory token
store, and **the app signs out every time it is closed**. `data-provider.tsx` documents this
in its own comment as "a real remaining gap, recorded rather than hidden".

FR-002 cannot be satisfied without building the missing half, and building it for the address
but not the credential would leave the owner re-pasting a token on every launch — which makes
a session materially worse to use and would be the eighth instance of a declared half with no
other half in this codebase.

**Two notes that will matter at implementation time**, both from `CLAUDE.md`:

- **The version is `2.2.0`, exactly.** Read from
  `node_modules/expo/bundledNativeModules.json` under SDK 54 on 2026-09-12 (T001). The
  bundled value carries no range prefix, so it is pinned exact rather than caret- or
  tilde-ranged. `expo-secure-store` sits beside it at `~15.0.8` and was rejected above.
- **Install it with `expo install`, never `pnpm add`.** The latter took
  `expo-image-picker@57` against SDK 54 and killed the app at module registration with
  `NoClassDefFoundError`. `expo install` cannot reach its API from this sandbox, so read
  `node_modules/expo/bundledNativeModules.json` — which is authoritative — and pin the
  version it names.
- It is a **native** module, so the APK must be rebuilt. That is already happening.

**Alternatives considered**:

| Option | Why not |
|---|---|
| `expo-secure-store` | Correct instinct for a credential, but it warns above ~2 KB per value and a JWT can approach that. Trading a working sign-in for encryption-at-rest of a short-lived session token is a bad trade, and the web half already stores the token unencrypted in `localStorage` |
| `expo-file-system` | Works, but hand-rolls a key/value layer over files for no benefit |
| Don't persist; retype each launch | Fails FR-002, and makes the feature unpleasant enough that it would not get used |

---

## R5 — Sign-in gets a second field, and the submit stays above both

**Decision**: The address field joins the credential field on the sign-in surface, and the
control that submits them stays **above both**. The fold is measured by
`browser/signin-fit.spec.ts` before the change is called done.

**Rationale**: This surface has a hard-won invariant. Runs 39, 40 and 41 each spent about
twenty minutes signed out because the submit control sat below the fold once the soft
keyboard opened, and the screen deliberately does not scroll (run 36, which turned eight
screens into ScrollViews on a rule inferred from one measurement and took the product from
18/19 to 1/19). A control **above** the fields cannot be covered by a keyboard that opens
below them, at any keyboard height, under `adjustResize` and `adjustPan` alike. That is an
invariant rather than a number, which matters because **a soft keyboard cannot be measured in
a browser** — react-native-web has none. `signin-fit.spec.ts`'s first version encoded an
invented constant (250 points of keyboard) and passed through two failing device runs.

Adding a field shifts the layout, so the invariant is re-measured rather than assumed — but
what is asserted is the ordering, not a pixel count, because a guard that asserts only a
number passes again the moment a control shrinks.

**Alternatives considered**: putting the address on a separate screen (a pushed screen has no
tab bar and adds a navigation step to the one flow that must not gain one — 005/J-21);
hiding it behind a long-press (undiscoverable, and the owner is the only user); a build-time
flag (defeats the entire purpose).

---

## R6 — Changing the address discards the credential

**Decision**: Setting the backend address to a value different from the stored one clears the
stored credential, in one place, unconditionally.

**Rationale**: A credential is issued by one session and is meaningless to any other — a
different session has a different signing secret (R7), so the token will be rejected. Keeping
it produces the worst available state: the app believes it is signed in, every request fails
authentication, and the person sees a product that appears broken rather than a sign-in
screen. FR-004 forbids presenting a failure as an absence of content, and this is the most
likely way to violate it.

Doing it in one place is the same argument as one `VisibilityFilter` and one
`profile.projection.ts`: a rule applied at two call sites is a rule that will be applied at
one of them.

**Alternatives considered**: keying the stored credential by address so several are held at
once (real capability, no demand — the owner uses one session at a time, and it adds a
cache-invalidation problem to a feature that does not need one); validating the old token
against the new address and keeping it if it happens to work (it cannot, and the attempt adds
a network round trip to a code path that should be local).

---

## R7 — Lifetime is chosen at dispatch, enforced by the job, and secret-scoped

**Decision**: Session lifetime is a dispatch input, defaulting to **2 hours**, capped by the
platform at 6. The job ends itself when the lifetime elapses. Each session generates its own
`LOCAL_JWT_SECRET`.

**Rationale**: The owner was asked 2 versus 6 and did not answer; 2 is the smaller commitment
and a session costs nothing to start again. A long idle job is also the part of this
arrangement least comfortably inside what a CI platform is for — GitHub's terms cover
"production, testing, deployment or publication of the software project", and manual device
testing of your own app is squarely that, while a parked server is the arguable part. A
shorter default keeps the feature on the clear side of that line.

The per-session secret does two jobs: it satisfies FR-015, and it makes R6's invalidation
**true** rather than merely tidy — a token from yesterday's session is cryptographically
rejected by today's, so there is no state in which a stale credential silently half-works.
`configuration.ts` already refuses the published development secret, so a session cannot
accidentally fall back to a known value.

**Alternatives considered**: a fixed 6 hours (wastes the platform's headroom on idle time for
no benefit); no automatic end (the job is killed at 6 hours regardless, so this only removes
the owner's ability to choose); a stored shared secret (fails FR-015, and would make every
session's credentials interchangeable).

---

## R8 — The descriptor is written where a phone can read it

**Decision**: Both addresses, the credential and the expiry time are written to the job's
step summary, together, at the moment they are known. Not only to the log, and not to an
uploaded artifact.

**Rationale**: This is `CLAUDE.md`'s most repeated operational lesson, in a third place. Run
40's evidence was printed first in its step, above eighty-five rows that never move; job logs
come back only as a **tail**, and the artifact holding the same data sits on a blob host this
environment's egress denies with a 403. Two tails and 380 lines never reached it, which is
why run 40 is recorded as *cause unknown* rather than given a story. Run 56 taught the same
thing in time rather than space: evidence printed after the loop never printed at all,
because the loop was killed first.

The owner will be reading this **on a phone**, which makes every one of those failure modes
worse. The summary is rendered, scrollable, and copy-pasteable in the GitHub mobile app.

**Corollary, which FR-021 makes a requirement**: the descriptor is emitted when the session
is ready, and a *failure* names the step that failed at the moment it fails. A bring-up that
dies silently at step four is the run-56 failure again.

---

## R9 — No server change, and that was checked rather than assumed

**Decision**: `apps/api`, `apps/workers`, `infra` and the data model are untouched.

**Rationale**: Verified by reading, in four places:

- **The address is entirely a client concern.** `API_BASE_URL` flows through exactly one
  place — `App.tsx`'s `<DataProvider baseUrl={...}>` — and `DataProvider` already rebuilds
  the data layer when `baseUrl` changes, because it is a `useMemo` dependency.
- **The bring-up needs no new configuration.** `S3_PUBLIC_ENDPOINT`, `LOCAL_JWT_SECRET`,
  `DYNAMO_ENDPOINT`, `S3_ENDPOINT` and `MEDIA_BUCKET` are all already environment-driven, and
  the emulator workflow already sets them.
- **The credential already has a minting path.** `apps/api/scripts/mint-device-token.ts`
  writes the profile row through the API's own `PersonRepository`, because a signed JWT whose
  profile row does not exist gets `404 No such person` — a signed token is not an identity.
- **`apps/workers` is a barrel of exported functions, not a daemon.** The handlers are
  imported directly by the API, so there is **one process** to start, not two.

**What this rules out**: any temptation to add a "session mode" to the server. A flag that
changed server behaviour would be a second configuration selected by an environment variable
that only one environment exercises — the shape the four AWS adapters were deleted for.

---

## R10 — A session must be indistinguishable from the product, except in address

**Decision**: Nothing about running as a session may change what the product does. No route
becomes public, no visibility rule relaxes, no safety surface is disabled, no seed data is
enriched beyond the interest catalogue the product needs to function.

**Rationale**: Principle II decides visibility once, and Principle III enforces it
server-side. A session is reachable from the public internet, which is the first time that
has been true here — so the temptation to smooth a rough edge by loosening something is real
and is exactly what must not happen. The gates in the plan are mechanical for this reason:
the visibility matrix totals and the public-route snapshot are both pinned and both must be
unchanged when this feature lands.

**One thing that follows and is easy to miss**: the app must not read the backend address to
decide anything. It is a destination, not a capability. A person pointing the app at a
different server gets that server's answers; they do not get more of this one's.

**Alternatives considered**: seeding a session with demo content so the feed is not empty —
rejected, because the spec requires the product to be usable from an empty datastore and
seeding would hide the case where it is not. Publishing a post is the first thing the owner
does anyway, and SC-003 requires it.
