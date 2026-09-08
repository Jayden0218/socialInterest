# Next UI pass — design source

Three directions for ONE screen (home), at 390x844, authored as Design
Components and laid out by `canvas.json`. Static mockups: they exist to settle
the look before a requirement is written.

| File | Direction |
|---|---|
| `Main.dc.html` | **A · Field Almanac** — leading candidate |
| `Index.dc.html` | **B · The Index** |
| `Rooms.dc.html` | **C · Rooms** |

## Two rejected attempts, and why

**006, as shipped: "too general design, no design sense."** It built a token
system and then painted the existing wireframe with it. Layout, hierarchy and
control vocabulary never changed - no icons anywhere, every control the same
pill, compose floating in the content flow, whole screens of dead space.

**The first pass here: "too similar to Instagram."** Also correct, and the
deeper fault was not visual. It collapsed the product's model - **you follow
SUBJECTS, not people** - into a single blended stream with an interest rail
bolted on top. Constitution I and 001/FR-033 say a person-follow must never
widen a feed beyond followed interests. A design that renders one undifferentiated
stream cannot express that, whatever colour it is painted.

## What each direction is for

Every one of them tries to make the organising principle STRUCTURAL rather than
decorative.

- **A · Field Almanac.** The feed is sectioned by interest and never mixed -
  the structure itself enforces FR-033, because you cannot render the screen
  without grouping. Editorial: Newsreader serif, hairline rules, media as inset
  plates, IBM Plex Mono for bylines. Says the subject matters more than the
  poster. Trade: type-led, so less media per screen.
- **B · The Index.** Makes the machinery visible - the header states that the
  feed is composed from five interests and carries live counts. Numbered rows,
  strict grid, Space Grotesk with mono meta. Feels like an instrument. Trade:
  cold, and the least media-forward.
- **C · Rooms.** An interest is a place with its own light; home is a threshold
  rather than a stream, each room sized by how alive it is and quiet ones
  visibly resting. Trade: most colour-dependent, and content is one tap away.

## Known departures from the current tokens

- **These abandon the shipped palette deliberately.** A is warm ink-and-bone,
  B is near-black with an acid accent, C keeps green but far more saturated.
  Whichever is chosen, `tokens.ts` changes - and `contrast.test.ts` enumerates
  the whole generated space, so it will say whether the new values hold.
- **Media is a gradient placeholder.** There is no photography in the repo, and
  the ffmpeg test patterns the capture harness produces would misrepresent the
  design rather than illustrate it.

## Regenerating the canvas

The seeded bundle is gitignored - it is this source plus a ~2.5 MB editor
payload. Re-seed from these files with the design tooling, passing every
`.dc.html` plus `canvas.json`, then publish.
