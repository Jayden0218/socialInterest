# Feed and post — design source

Two artboards at 390x844. Static mockups, made to settle the look before a
requirement is written.

| File | Screen |
|---|---|
| `Main.dc.html` | Two-column waterfall feed |
| `Post.dc.html` | A post |

## The position: calm, not clever

**A design someone opens forty times a day has to disappear.** The pass before
this one was a poster - paper grain, deliberate mis-registration, art-school
typography. Impressive once and tiring by the third open, and it made every
card slower to read. Rejected for the right reason: a design that shows off is
a design that costs the person something every time.

So:

- **One typeface.** Plus Jakarta Sans, four weights. Nothing else.
- **One accent.** The forest green, used for the active tab, the compose
  button, the follow button and the interest word. Nowhere else.
- **No shadows.** Depth is a white card on a warm ground plus the gutter -
  which is how the two-column waterfall does it, and it is enough.
- Everything else is spacing.

## The structure

**Xiaohongshu's two-column waterfall.** Fixed column width, image height drives
card height, so the columns stagger and the rows never line up. Four to five
posts on screen. No sections, no interest grouping - the feed is ranked
server-side and the UI never mentions it.

## The one signature

**The interest is a coloured WORD under each card.** Not a chip, not a badge,
not a stamp. It colour-codes the feed so the eye can sort it while scrolling,
it costs no space, and it makes no noise. That is the whole visual identity and
it is deliberately all of it.

## Legibility, because that was the point

- Card titles 13.5px semibold / 18px line height - two lines before truncation.
- Post body 14px / 21px. Nothing meta drops below 11.5px.
- Tab labels 10.5px and always paired with an icon, never the only cue.
- Every tap target at least 44px tall, compose button and tab items included.
- Type scales with the platform font setting; no fixed-height box around text.

## Rejected passes, and why

1. **006, as shipped** - "too general, no design sense." It built a token
   system and painted the existing wireframe with it; layout, hierarchy and
   control vocabulary never changed.
2. **Instagram-alike** - "too similar to Instagram", and it collapsed the
   product model into one stream with an interest rail bolted on as decoration.
3. **Almanac / Index / Rooms** - "should show posts, not like news." Chasing
   "not Instagram" produced magazine layouts with postage-stamp thumbnails.
4. **Mosaic / Shelves / Immersive** - media-forward but still sectioned by
   interest, which the learned feed removes.
5. **Blended immersive + "why you're seeing this"** - one post per screen when
   the ask was several, and the ranking is the backend's business.
6. **Risograph printed matter** - "too fancy; if too complex, the user will not
   use it." Correct. Style at the cost of usability is not style.

Each pass failed for a nameable reason, and the reasons did not repeat.

## Still open

- **Media is a soft gradient, not a photograph.** Real images change the
  balance of every card - they are the first thing to drop in.
- **Cold start.** A ranked feed has nothing to learn from on day one, and there
  is no screen yet for what a new account sees.
- **The constitution.** Principle I ("Interest Is the Organising Principle") is
  marked NON-NEGOTIABLE and 001/FR-033 has a negative test enforcing it. A
  ranked, blended feed replaces both, so `/speckit-constitution` comes before
  any spec. One thing must NOT change: ranking picks candidates,
  `VisibilityFilter` still decides at read time.
- **Disclosure.** Dropping the "why you're seeing this" sheet removes it from
  the post, not the obligation: dwell-time collection still has to be
  disclosed somewhere findable, and a reset still has to exist.

## Regenerating the canvas

The seeded bundle is gitignored - it is this source plus a ~2.5 MB editor
payload. Re-seed from these files with the design tooling, passing every
`.dc.html` plus `canvas.json`, then publish.
