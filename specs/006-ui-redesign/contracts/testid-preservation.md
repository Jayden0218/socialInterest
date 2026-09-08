# Contract: testIDs are an interface, not an implementation detail

**Status**: binding for this feature. Enforced by
`apps/mobile/src/__tests__/testid-snapshot.test.ts` (R3).

## Why this is a contract

`apps/mobile/src/**` is consumed by two things that are not the app:

- **19 Maestro flows** in `.maestro/`, which run on an Android emulator and
  select elements by `testID`.
- **The browser journeys** in `apps/e2e/browser/`, which select by
  `[data-testid="…"]`.

A `testID` is therefore part of an interface with those suites, in the same way
an OpenAPI path is part of an interface with a client. Renaming one is a breaking
change; it simply fails 20 minutes into a 25-minute run instead of at compile
time.

Measured 2026-09-07: **178 literals and 39 dynamic prefixes**, across 150
selectors in 19 flows.

## The rules

| # | Rule |
|---|---|
| 1 | An existing `testID` MUST NOT be renamed |
| 2 | An existing `testID` MUST NOT be removed |
| 3 | An existing `testID` MUST stay on an element with the same meaning — moving `post-caption` from the caption to the card is a breaking change even though the string survives |
| 4 | A dynamic prefix MUST keep its **leading literal in the JSX**. `verify-maestro-ids` reads prefixes off the leading literal of a template in a `testID=` position and cannot see through a function call |
| 5 | New `testID`s are welcome, and are added to the snapshot in the same commit |
| 6 | A control that becomes non-interactive MUST NOT keep an id implying it is interactive |

## Why the existing checks are not enough

`scripts/verify-maestro-ids.mjs` proves **every selector resolves to something in
the app**. It cannot prove **every testID survived**, because a testID deleted
together with the flow that used it satisfies it perfectly.

The two checks face opposite directions, and this feature needs both:

```
verify-maestro-ids   flows  ->  app     "does every selector exist?"
testid-snapshot      app    ->  snapshot "did anything disappear?"
```

This is the same shape as `tests/integration/auth-surface.spec.ts`, which
compares the public route set to a snapshot **in both directions** — written that
way because its first version was a hand-picked list and missed the second
occurrence of the very defect it existed to catch.

## Rule 4, concretely

Rule 4 is the one that already cost three attempts on the group row testID:

```tsx
// visible to the guard - prefix is the leading literal
testID={`group-row-${conversationSlug(item)}`}

// INVISIBLE to the guard - the prefix is inside a function
testID={conversationRowId(item)}

// INVISIBLE to the guard - the prefix is interpolated
testID={`${kind}-row-${suffix}`}
```

Only the first form declares a prefix. The other two make every `group-row-.*`
selector match nothing in the source, and a selector that matches nothing fails
as a **timeout**, not as a name error.

## On changing this contract

If a redesign genuinely needs a testID to change, that is allowed — but it is a
change to two suites, made in one commit:

1. Update the component.
2. Update every `.maestro/` flow and browser journey that selects it.
3. Update the snapshot.
4. Run `verify-maestro-ids` **and** the browser journeys.

What is forbidden is doing (1) alone and discovering (2) on a device.
