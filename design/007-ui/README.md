# A learned feed — design source

Two artboards at 390x844: the feed itself, and the control that lets a person
correct it. Static mockups; they exist to settle the look and the model before
a requirement is written.

| File | Screen |
|---|---|
| `Main.dc.html` | One blended stream |
| `Tune.dc.html` | Why you're seeing this |

## The model

**A learned feed, not a subscription.** No sections, no shelves, no interest
axis: the next post is whatever the ranking picked. The server learns from what
a person actually does - what they open, how long they stay, what they save -
and serves more of it.

**The interest survives as a TAG, not as structure.** It is the dimension the
model learns over ("this person watches climbing to the end"), which is why it
still appears on every post and is still tappable. It is no longer the shape of
the screen.

**The tuning sheet is not optional.** A feed learned from behaviour needs a way
to see why and to say no, or the only way to correct it is to stop using the
app. It also names the signals in plain words, which is where Principle III
lands once dwell time is being measured.

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

## Four rejected passes, and why

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
   interest, which this change removes.

## Known gaps

- **Media is a gradient placeholder.** There is no photography in the repo, and
  the ffmpeg test patterns the capture harness produces would misrepresent the
  design rather than illustrate it. A handful of real images would make this
  much easier to judge.
- **Cold start is undesigned.** A learned feed has nothing to learn from on day
  one; what a new account sees is an open question, and picking interests at
  signup is the obvious answer that this design currently has no screen for.

## Regenerating the canvas

The seeded bundle is gitignored - it is this source plus a ~2.5 MB editor
payload. Re-seed from these files with the design tooling, passing every
`.dc.html` plus `canvas.json`, then publish.
