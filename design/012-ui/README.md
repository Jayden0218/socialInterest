# `design/012-ui/` — which artboard governs which screen

24 artboards, published as a Claude Design canvas. This file exists so an
implementer does not have to open the canvas to know what they are building
against (012/T002).

**The artboard wins.** Where the implementation has drifted, the artboard
governs and the drift is recorded rather than silently accepted (FR-026).

## Tokens, and where they actually live

The artboards draw the values; `apps/mobile/src/ui/tokens.ts` is the source the
product reads. They agree except where noted, and where they differ the reason
is written down in `tokens.ts` itself rather than here — one place, at the
definition point.

| | Value |
|---|---|
| Ground | `#FBFAF8` page, `#FFFFFF` card, `#F3F1EC` sunken |
| Text | `#16211A` primary, `#43514A` secondary, `#606C66` muted |
| Line | `#ECEAE4` hairline, `#CFCABE` strong |
| Accent | `#1F6B3F` — **one** accent, guarded |
| Danger | `#C0392B` |
| Space | 4 / 8 / 12 / 16 / 24 / 32 |
| Radius | card 14, button 11, field 21 |
| Type | display 20/26/700 … tab 10.5/14/600 |
| Font | Plus Jakarta Sans |
| Shadows | **none** — `elevation` is deleted from tokens, not zeroed |

**The artboards' faintest grey `#8A948C` is NOT a token.** It measures ~2.9:1 on
white and fails the contrast floor, so `text.muted` carries those roles at
`#606C66`. A deliberate, stated deviation: the design is settled on FORM, and
006/FR-015's floor is not a matter of taste.

## Icons

`_icons.txt` holds 16 paths on a 24 grid, drawn at stroke 1.75 with round caps
and joins. `apps/mobile/src/ui/icons.ts` adds **three** the artboards do not
draw — `play`, `send`, `star` — for controls that live on screens the canvas
does not cover. That addition is recorded at its definition point and the
reasoning is there, not here.

Three sizes and no fourth: **13** beside a count, **20** for an action, **23**
for a navigation destination.

## The screens

| Artboard | Implements | Status |
|---|---|---|
| `Main.dc.html` | the feed — `HomeFeedContainer` | **implemented** (T009–T013, T015) |
| `CardAnatomy.dc.html` | `components/PostCard.tsx` | **implemented** (T013) |
| `Icons.dc.html` | `ui/icons.ts`, `ui/Icon.tsx` | **implemented** (T004, T005) |
| `States.dc.html` | `ui/states.tsx` | Phase 4 |
| `Explore.dc.html` | `DiscoverContainer` | Phase 8 |
| `InterestSpace.dc.html` | `InterestContainer` | Phase 8 |
| `ColdStart.dc.html` | `PickInterestsContainer` | Phase 8 |
| `PostActions.dc.html` | the post actions sheet | Phase 7 |
| `SafetySheet.dc.html` | `SafetyContainer` | Phase 7 |
| `FlowMap.dc.html` | — | reference; every control and where it goes |

### Drawn, and NOT implemented by feature 012

`Activity`, `Auth`, `Chats`, `Compose`, `Conversation`, `EditProfile`,
`MediaPicker`, `NewMessage`, `OwnProfile`, `Place`, `PostDetail`, `Profile`,
`Saved`, `Search`.

That is scope, not oversight — the MVP is Phases 1–3, and these are screens that
already work and are not what prompted the feature. It is written down because
an artboard drawn and unclaimed is how "the redesign is finished" gets said over
unchecked boxes. `tasks.md` T053 puts the split into the run record.

## The names do not match the code

| Artboard | Container |
|---|---|
| Explore | `DiscoverContainer` |
| Activity | `NotificationsContainer` |
| Chats | `InboxContainer` |

004 recorded what this costs: a requirement reported unimplemented in four
documents because the grep was `notificationPreferences` and the code says
`notificationPrefs`. 012's own research made the same class of error.
