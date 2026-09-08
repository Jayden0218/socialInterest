# A learned feed — design source

Two artboards at 390x844: the feed itself, and the control that lets a person
correct it. Static mockups; they exist to settle the look and the model before
a requirement is written.

| File | Screen |
|---|---|
| `Main.dc.html` | Waterfall feed, newsprint |
| `Night.dc.html` | The same feed on black stock |
| `Post.dc.html` | A post |

## The model

**A learned feed, not a subscription.** No sections, no shelves, no interest
axis: the next post is whatever the ranking picked. The server learns from what
a person actually does - what they open, how long they stay, what they save -
and serves more of it.

**The interest survives as a TAG, not as structure.** It is the dimension the
model learns over ("this person watches climbing to the end"), which is why it
still appears on every post and is still tappable. It is no longer the shape of
the screen.

**The ranking is invisible.** No "why you're seeing this", no explanation - the
learning happens server-side and the UI never mentions it. Note that this does
NOT remove the Principle III obligation: dwell-time collection still has to be
disclosed somewhere a person can find it, and a way to reset the signals still
has to exist. It just does not belong on the post.

## What this costs — recorded so the decision is deliberate

This is a change of premise, not of skin:

- **Constitution Principle I** ("Interest Is the Organising Principle",
  NON-NEGOTIABLE) and **001/FR-033** are replaced. The negative test guarding
  them (`SC-006`, `feed-does-not-read-place-follows.spec.ts`) would be deleted,
  not adjusted. The constitution needs amending first - that is
  `/speckit-constitution`, not a code change.
- **Machinery that does not exist**: dwell-time telemetry from the client, a
  per-viewer signal store, and a ranking service between the datastore and the
  feed.
- **D1 still binds.** Read-time assembly was forced by FR-017 + SC-009: a
  visibility flip must land everywhere immediately. So ranking chooses
  CANDIDATES and `VisibilityFilter` still decides at read time - Principle II
  is untouched by this change and must stay that way.
- **Dwell tracking is behavioural data collection.** Hence the sheet naming the
  signals rather than hiding them, and a way to clear them.

## Where the style came from

Researched rather than invented:

- **Structure** — Xiaohongshu's two-column waterfall: fixed column width, image
  height drives card height, rows deliberately never line up. 3:4 cards,
  ~12-16px radius, and **no shadows at all** - depth comes from spacing and
  rounding. (`en.pingwest.com/a/11673`, `open-design.ai`)
- **Style** — 2026's move away from glossy polish toward the "carefully
  unpolished": grain and risograph effects, deliberate mis-registration
  simulating print imperfection, mono type as structure, grids as foreground.
  (`inkydesignworks.com`, `setproduct.com`, `uxpilot.ai`)

Every competitor in this space - Instagram, RED, Pinterest - is glossy,
neutral and shadowless-clean. Newsprint with forest-green ink, a risograph
accent and a 4px mis-registered plate behind every card is not a look any of
them has.

## The signature moves

1. **Mis-registration.** A solid ink block sits 4px off behind every card and
   the wordmark, as if the colour plate did not quite line up. One move, and
   the whole surface reads as printed.
2. **Paper grain over the entire sheet**, not per image - the grain belongs to
   the paper, which is what makes it read as print rather than as a filter.
   It multiplies on newsprint and screens on black stock, because that is what
   ink does.
3. **Type as structure.** Syne for headlines (wide, art-world, uncommon), IBM
   Plex Mono for every small thing - counts, tags, timestamps, tab labels. The
   mono is the grid made visible.
4. **Stamps, not chips.** An interest is a printed stamp on the plate: a solid
   paper rectangle with an ink square and mono caps.

## Rejected passes, and why

1. **006, as shipped** - "too general design, no design sense." It built a token
   system and painted the existing wireframe with it; layout, hierarchy and
   control vocabulary never changed.
2. **Instagram-alike** - "too similar to Instagram." It also collapsed the
   product model into one blended stream with an interest rail bolted on top -
   decoration standing in for structure.
3. **Almanac / Index / Rooms** - "should show posts, not like news." Chasing
   "not Instagram" produced type-led magazine layouts with postage-stamp
   thumbnails. The posts are the content.
4. **Mosaic / Shelves / Immersive** - media-forward, but still sectioned by
   interest, which the learned feed removes.
5. **The blended immersive feed** - one post per screen, and a "why you're
   seeing this" sheet. Two faults: the owner wants SEVERAL posts on screen
   (Xiaohongshu's waterfall), and the ranking is the backend's business - the
   UI should say nothing about it.

## Known gaps

- **Media is a duotone plate, not a photograph.** This is the thing to test
  first: real images will fight the grain and the mis-registered ink blocks,
  and how hard they fight decides whether the ink treatment applies to the
  whole card or only to its border.
- **Cold start is undesigned.** A learned feed has nothing to learn from on day
  one; what a new account sees is an open question, and picking interests at
  signup is the obvious answer that this design currently has no screen for.

## Regenerating the canvas

The seeded bundle is gitignored - it is this source plus a ~2.5 MB editor
payload. Re-seed from these files with the design tooling, passing every
`.dc.html` plus `canvas.json`, then publish.
