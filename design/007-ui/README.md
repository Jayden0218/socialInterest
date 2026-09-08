# Core-screen redesign — design source

Five phone artboards (390x844) for the next UI pass: feed, interest space, post
detail, profile, chats. Authored as Design Components (`.dc.html`), laid out by
`canvas.json`, and published as a design canvas.

**These are static mockups, not a prototype**, and not yet a spec. They exist to
settle the look before any requirement is written, because 006 got that order
wrong: it built a token system and then painted the existing wireframe with it,
so the layout, hierarchy and control vocabulary never changed.

## What this direction changes

| 006, as shipped | Here |
|---|---|
| No icons anywhere in the app | An icon tab bar, drawn as SVG on a 24px grid |
| Every control the same pill | Underline tabs, chips and buttons read as three things |
| Compose floating in the content flow | The centre tab action |
| One weight of system sans | Instrument Serif for interest names, Schibsted Grotesk for UI |
| Cards barely distinguishable from the page | Media edge-to-edge; no card frame to fail |

## The idea worth keeping

**The interest is the container.** Each interest's derived hue appears in a
different form on every surface - an orb in the feed rail, a wash behind the
interest header, a spine down the media, a dot on a chip. 006 derived those
colours correctly and then used them on one 4px rule. This is the same
derivation, given something to do.

## Known departures from the current tokens

- **Interest colours are brighter here.** `dark.interest` is `l: 0.34, c: 0.08`,
  which renders near-black on a dark surface. These mockups assume roughly
  `l: 0.72, c: 0.14`. Adopting this direction means changing that token, and the
  contrast test enumerates the whole space, so it will say whether it holds.
- **Media is a gradient placeholder.** There is no photography in the repo, and
  the ffmpeg test patterns the capture harness produces would misrepresent the
  design rather than illustrate it.

## Regenerating the canvas

The bundle is gitignored. Re-seed it from these files with the design tooling,
passing every `.dc.html` plus `canvas.json`, then publish.
