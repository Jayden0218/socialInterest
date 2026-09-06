# Research: Verified in the cloud, end to end

**Feature**: 003-device-and-hosting | **Date**: 2026-09-06

Decisions numbered R1–R6, continuing from feature 002's R-series.

---

## R1 — Launch the Android runtime directly and always capture its output

**Decision**: Replace `reactivecircus/android-emulator-runner` with `sdkmanager` +
`avdmanager` + a direct `emulator` launch in a plain step, with stdout and stderr redirected
to a file that is uploaded as an artifact on success *and* failure. Poll `adb` for
`sys.boot_completed` with a bounded wait, and on timeout print the captured file before
failing.

**Rationale**: Six attempts produced six different hypotheses and no evidence. The action runs
the emulator as a child process and surfaces only its own poll loop, so every failure looked
identical — `adb: device 'emulator-5554' not found` repeated until timeout, then
`Connection refused`. The one artefact that would distinguish "the AVD was not found" from
"the GPU backend failed" from "the kernel refused to start" has never been read. Redirection
is the documented approach for exactly this, and a directly launched process makes the
existing `-accel-check` and `-verbose` output reachable too.

This decision is deliberately indifferent to whether the emulator then boots. A captured
failure satisfies FR-004 and ends a line of guessing that has already cost six runs.

**Alternatives considered**:

- *`ReactiveCircus/setup-android-emulator`* — a newer action that installs and starts the
  emulator while leaving the test script to the caller. Closer to what is wanted, but it still
  owns the launch, which is precisely the part whose output is missing. Reconsider once the
  failure is understood.
- *`budtmo/docker-android`* — a container bundling emulator, noVNC and video recording,
  designed for CI. A strong fallback if the direct launch also fails, and it brings its own
  logging. Not first because it adds a large moving part before the current failure is
  understood, and diagnosing two unknowns at once is what went wrong already.
- *Keep the action and raise timeouts* — already tried. Run 5 honoured a 1800s budget and
  spent all of it with no device.
- *Give up on Android* — premature. The failure has never been observed, so "cannot be done"
  is not yet an evidenced conclusion, and FR-004 requires evidence rather than a verdict.

---

## R2 — Durability: persist the datastore, give object storage a volume, make the bus outlive the process

**Decision**: Three targeted changes.

1. Datastore: replace `-inMemory` with `-dbPath` on a mounted volume, and `-sharedDb` stays.
2. Object storage: mount a volume at the server's data directory.
3. Event bus: persist the event and its handled state, so an event published before a crash
   is handled after the restart rather than lost.

**Rationale**: Each is a genuine product weakness independent of hosting, and each is provable
by the same test: write, restart everything, read back. The datastore currently keeps
everything in memory, so a restart loses every post; the object store writes inside the
container's writable layer, so a recreate loses every upload; the bus delivers on the next
tick with no record, so a process that dies between publish and handle drops the event
silently. That last one is the same class of defect as 002's "nothing subscribed to
`post.created`" — a post that never leaves `pending` is invisible to everyone but its author.

**Alternatives considered**:

- *Only the datastore* — leaves two of three failure modes. The acceptance is a full-stack
  restart, so a partial fix does not pass it.
- *An external queue* — a managed queue is spend, and a containerised broker is a large
  dependency for a bus with three event types. The persistence needed here is a record and a
  handled flag.
- *Declare durability out of scope until hosting exists* — rejected. It is the half of
  "somewhere to run it" that needs no account, and it is the half that makes Story 5 possible.

---

## R3 — Decide D3 before anything is built on the datastore, and decide it on measurability

**Decision**: Revisit D3 as Story 3, before Story 5 and before any durability work hardens the
current choice further. The deciding consideration is added explicitly: **can the datastore run
as itself outside a deployment?**

**Rationale**: D3 recorded that PostgreSQL fitted this spec better and that DynamoDB was the
owner's instruction — an instruction that pointed at AWS, which was dropped on 2026-09-05. So
the reason for the choice is weaker than when it was made, and the reason to revisit it now
rather than later is concrete: **D9 deliberately gave the datastore no adapter**, on the sound
reasoning that the local emulator speaks the same API. That means the choice is spread across
**14 repository classes**, and changing it later means rewriting all of them.

The measurability point is what makes this a Story 3 decision rather than a preference. A
datastore whose local form is an *emulator* can never be load-measured honestly without
spending — which is exactly why 002's SC-002 had to be withdrawn. A datastore whose local form
is *the same software* can be measured in a container, at no cost, for real. The choice
therefore decides whether Story 5 has an answer at all.

**Alternatives considered**:

- *Leave D3 alone* — defensible on sunk-cost grounds: the single-table design and 20 access
  patterns are built and tested. But it permanently forecloses Story 5 without spend, and the
  cost of the decision only grows.
- *Add a datastore adapter so both work* — contradicts D9 and doubles the implementations
  behind a switch, which is the exact shape that produced 002's untested-adapter problem.
- *Decide after durability work* — worse: durability work on the current datastore is effort
  that a switch would discard.

---

## R4 — Media picker: install a real picker, place the file, exercise both permission paths

**Decision**: Install a native image picker module, mount `MediaPickerScreen` behind compose,
place a test image into the emulator's library over `adb`, and drive both outcomes — permission
granted and permission refused.

**Rationale**: Publishing is the product's core act and its first step is currently faked with
a bundled sample. Permission handling in particular has no other way of being checked: a
browser has no Android permission model. Placing the file over `adb` keeps the journey
deterministic without faking the picker itself — the app still goes through the real module and
the real dialog, which is where the untested behaviour lives.

**Alternatives considered**:

- *Keep the bundled sample* — leaves the first step of the core act unexercised and permissions
  entirely untested.
- *Mount the picker over a fabricated list* — rejected during 002 for the reason that still
  applies: it makes an audit pass without making anything reachable.
- *Grant the permission via `adb` and skip the refusal path* — the refusal path is the one that
  fails badly in real apps, and FR-012 requires it.

---

## R5 — Load measurement reports what it measured

**Decision**: Keep the three-way attribution from 002 (`bench:ceiling`) and add a required
field naming what the datastore actually was. A run against a stand-in is reported as a
measurement *of the stand-in*.

**Rationale**: 001 reported p95 11.8s as a fact about the design; it was a fact about the
emulator, and it drove a proposal to build a hybrid that turned out to be unwarranted. The
attribution added in 002 is what caught that. Carrying the datastore's identity in the record
is what stops the same mistake being made again in the opposite direction — reporting a good
container number as though it said something about production.

**Alternatives considered**:

- *Drop load measurement until a real datastore exists* — loses the regression signal the
  application-shape ceiling provides on every change.
- *Report the container figure as the result* — precisely what FR-013 forbids.

---

## R6 — The teardown check must enumerate, not assume

**Decision**: Write the resource query so the check lists resources by tag and reports any
still present, and prove it by presenting it with a tagged resource that exists.

**Rationale**: The check exists and reports clean, but its query was never written — so it
reports clean by not looking. That is worse than having no check, because it produces a
confident answer with nothing behind it. It depends on nothing, needs no approval, and must be
trustworthy *before* anything is ever provisioned. It is also the only story here with no
unknowns at all.

**Alternatives considered**:

- *Delete the check* — honest, but discards the guarantee at the moment it becomes needed.
- *Leave it partial and note it* — it is already noted (002/T069) and the note has not made it
  work.

---

## Deliberately not researched

- **A public host.** Needs an account and credentials the agent does not have. Story 2 delivers
  durability instead, and the spec says so.
- **iOS.** Needs macOS runner minutes, which bill at ten times the rate on a private
  repository. Reported unverified.
- **Real usage.** Needs people. Withdrawn in the spec rather than substituted.

Sources consulted for R1: the runner action's README and issues, `actions/runner-images`
discussions on emulator support, and CI write-ups on launching the emulator directly with
redirected output.
