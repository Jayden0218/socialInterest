# `screens/` — one container per file

Containers fetch; the screens in `../features/` render. That division is
unchanged. What changed on 2026-09-11 is that the containers stopped sharing one
file.

`index.tsx` is now a barrel that re-exports all 25, so every importer —
`App.tsx` and four test files — is untouched.

## Why

`screens/index.tsx` was **2,726 lines holding every container**, and CLAUDE.md
names it a single-owner file for that reason. Two costs:

- **Merge.** Every change to any container touched the same file. For a
  downstream fork carrying its own UI that means a conflict on every sync, in a
  file where both sides' versions look correct. Now a fork overriding three
  screens touches three files and merges the other twenty-two clean.
- **Guards.** A source-text guard pointed at the monolith could not tell which
  container it had found something in. `share-to-person.test.tsx` asserted that
  "the app reaches for `Share.share(`" and would have passed if the *compose*
  screen did it; it now reads `ShareContainer.tsx` and means what it says.

## Layout

| | |
|---|---|
| `<Name>Container.tsx` | one exported container each |
| `shared.tsx` | `Failed`, used by 18 of the 25 |
| `index.tsx` | the barrel; also re-exports `SignedOutNotice` |

Two containers depend on another: `ComposeFlowContainer` renders
`ComposeContainer`, and that is the only edge between files here.

## The lesson this split cost, worth keeping

`hooks-before-return.test.ts` read `screens/index.tsx` **by name**. Splitting the
containers out left that path pointing at a barrel of re-export lines — no
`export function`, so no blocks, so no offenders, so **green**. The guard did not
fail when its subject moved out from under it; it passed while covering nothing,
on the very run that moved them.

It reads the directory now and asserts it found more than twenty files to scan,
because `expect(offenders).toEqual([])` is vacuously true over an empty list. **A
guard that finds nothing to inspect must fail, not pass** — the same shape as
`browser/measure.spec.ts`, which 007 deleted for having zero assertions while
counting as coverage.

Worth checking whenever files move here: `verify-maestro-ids.mjs` and the other
source-scanning guards in `../__tests__/` walk directories rather than naming
files, so they followed the move on their own. That one did not.

## For a downstream fork

Override a screen by replacing its file. Keep the export name and the barrel
needs no edit, which keeps `index.tsx` off the list of files that conflict on
every sync.

Testids are part of the contract with `.maestro/` — `verify-maestro-ids.mjs`
checks every selector still resolves, and it walks `apps/mobile/src`, so a
renamed or moved container is covered without it being told.
