# Next UI pass — design source

Three directions for ONE screen (home), at 390x844, authored as Design
Components and laid out by `canvas.json`. Static mockups: they exist to settle
the look before a requirement is written.

| File | Direction |
|---|---|
| `Main.dc.html` | **A · Mosaic** — leading candidate |
| `Shelves.dc.html` | **B · Shelves** |
| `Immersive.dc.html` | **C · Immersive** |

## Three rejected attempts, and why

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

**The second pass: a news reader.** "The design should show posts to let the
user see, not like news." Also correct. Chasing "not Instagram" I went
type-led - serif headlines, hairline rules, postage-stamp thumbnails - which is
a magazine, not a media app. THE POSTS ARE THE CONTENT. A design where you read
about the photographs instead of seeing them has failed whatever else it gets
right.

## What each direction is for

All three lead with the media AND group by interest. Those are not in tension;
the previous two passes each sacrificed one for the other.

- **A · Mosaic.** One section per interest, posts in a varied mosaic - a large
  tile with two small, alternating side each section so it never reads as a
  plain grid. Four posts per interest, roughly eight per screen. Trade: mixed
  tile sizes mean crops you do not control.
- **B · Shelves.** One shelf per interest: scroll DOWN through your interests,
  sideways through the posts inside one. About a dozen posts reachable without
  a tap, and a quiet interest is obvious because its shelf is short. Trade:
  portrait tiles suit some media badly, and sideways scrolling hides posts.
- **C · Immersive.** The post fills the screen; sideways moves between
  interests, down moves through the posts inside one, so the axis you swipe IS
  the organising principle. Trade: one post at a time, so browsing is slower
  and the structure is felt rather than seen.

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
