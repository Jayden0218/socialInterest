# `src/overlay/` — the runtime seam a downstream fork owns

Companion to `tests/overlay/`, which covers the guards. This one covers the
application itself. Empty in this repository and meant to stay empty; a
downstream private fork fills it in, upstream never does.

## `modules.ts`

`AppModule` spreads `OVERLAY_MODULES` into its `imports`, last. A fork adds a
feature by writing an ordinary Nest module and listing it here, so
`app.module.ts` gains no line per fork feature.

Ordering is a property, not tidiness: a fork's module may depend on anything
upstream provides, and nothing upstream may depend on a fork's.

**`imports` only.** `AppModule` also declares `controllers` and `providers`, and
neither is offered here:

- controllers belong to the module that owns them, so a fork's controller
  arrives through its own module and needs nothing at app level;
- the app-level providers are the two global guards, and "which guard
  authenticates this app" must have one answer readable in one place.

**What this does not claim.** A module listed here *can* register an `APP_GUARD`
provider of its own — that is how Nest composes and upstream cannot prevent it.
It is named here as a fork's own review item rather than left as a surprise.
`tests/unit/overlay-modules.spec.ts` pins upstream's two app-level guards so
they cannot be quietly changed while the overlay line is being edited.

## The three kinds of divergence, and which to reach for

Adding a module is the cheapest of three, and the order matters:

1. **Adding behaviour** → a new module, listed here. Near-zero conflict cost.
2. **Changing existing behaviour** → extract a port in `src/ports/` upstream and
   bind a different adapter in the fork. Zero conflict, and the extraction
   improves this repository on its own merits. `ports/` already holds
   `event-bus`, `identity-provider`, `media-processor` and `object-store`, so
   this is the established pattern here (001/D9), not a new one.
3. **Editing shared code directly** → a permanent conflict on that file, bought
   deliberately. Keep it to a hook or an early branch, never a restructure.

Reach for 2 before 3. Every time 3 is chosen, a file joins the set that
conflicts on every sync forever.

## Storage

A fork's entities live in the same single table, and the key namespace reserved
for them is documented in `../persistence/keys.ts` — `X#`, with `overlayKey()`
to build one and `tests/unit/overlay-key-namespace.spec.ts` enforcing that
upstream never allocates it. That guard sweeps every builder in `keys` rather
than a written-down list, so a key added upstream next year is covered without
anybody remembering it exists.

## What this does NOT relax

**Constitution II.** A fork's read path goes through the same
`VisibilityFilter` and is enumerated in the same matrix — `tests/overlay/` is
where its surface and its routing probe go. An overlay module is not permission
to construct a second visibility predicate.

**Principle V.** A green upstream run says nothing about the composed
downstream build. The fork runs the suites against its own composition and
registers the divergence in `docs/verification/divergence-register.md`.
