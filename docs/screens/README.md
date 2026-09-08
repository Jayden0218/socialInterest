# The screens, before and after feature 007 — SC-011

**After** is the current build, recaptured by
`apps/e2e/scripts/capture-screens.ts` against a running API. **Before** is the
same script's output at the last 006 commit, kept in `before-007/` so the pair
sits in one place rather than in two points of history.

## What this evidence is, and what it is not

These are **react-native-web in headless Chromium**. They render the same React
components through DOM primitives, so they show the palette, the type roles, the
waterfall and the interest colours — and they say nothing about native layout,
fonts, safe areas, touch targets as fingers hit them, or image decode on a real
device. Constitution Principle V: *emulation is not evidence*. The device run is
`.github/workflows/android-emulator.yml`, and **007 has not had one yet**.

## What changed, in one list

- **The palette inverted.** 006's signature was a dark forest green; the
  approved 007 design (`design/007-ui/`) is warm paper — page `#FBFAF8`, white
  cards, one accent `#1F6B3F` — with **no shadows anywhere**. Depth is the card
  on the page, the gutter, and the radius.
- **The feed is a two-column waterfall** (FR-021). Media at its own aspect
  ratio, so the columns stagger. Equal-height cards in two columns are a grid,
  and a grid crops every photograph to the same rectangle.
- **The interest is a coloured word** (FR-024), not a chip. One quiet signature:
  it colour-codes the feed so the eye can sort it without anything shouting.
- **No sections and no explanation** (FR-001, FR-010). One blended stream, and
  nothing anywhere says why a post is where it is. The disclosure lives once, in
  Settings.
- **A cold start** (FR-014) — new, and the first screen after signing in.

## Two things these images cannot show

- **Whether the coloured word is tappable at 11.5 points.** It carries a
  `hitSlop` rather than a 44pt box, because a 44pt box cost 43 points on every
  card (SC-008). Whether the target is real is a question about touch.
- **Platform font scaling.** react-native-web ignores it entirely, which is why
  006's overflowing `Avatar` initial could never have been caught here.

### 01 — feed signed out

| Before (006) | After (007) |
|---|---|
| <img src="before-007/01-feed-signed-out.png" width="380"> | <img src="01-feed-signed-out.png" width="380"> |

### 02 — sign in

| Before (006) | After (007) |
|---|---|
| <img src="before-007/02-sign-in.png" width="380"> | <img src="02-sign-in.png" width="380"> |

### 03 — cold start

| Before (006) | After (007) |
|---|---|
| _new screen in 007_ | <img src="03-cold-start.png" width="380"> |

### 04 — home feed

| Before (006) | After (007) |
|---|---|
| <img src="before-007/03-home-feed.png" width="380"> | <img src="04-home-feed.png" width="380"> |

### 05 — discover search

| Before (006) | After (007) |
|---|---|
| <img src="before-007/04-discover-search.png" width="380"> | <img src="05-discover-search.png" width="380"> |

### 06 — discover results

| Before (006) | After (007) |
|---|---|
| <img src="before-007/05-discover-results.png" width="380"> | <img src="06-discover-results.png" width="380"> |

### 07 — interest space

| Before (006) | After (007) |
|---|---|
| <img src="before-007/06-interest-space.png" width="380"> | <img src="07-interest-space.png" width="380"> |

### 08 — post detail

| Before (006) | After (007) |
|---|---|
| <img src="before-007/07-post-detail.png" width="380"> | <img src="08-post-detail.png" width="380"> |

### 09 — comments

| Before (006) | After (007) |
|---|---|
| <img src="before-007/08-comments.png" width="380"> | <img src="09-comments.png" width="380"> |

### 10 — discover place result

| Before (006) | After (007) |
|---|---|
| <img src="before-007/09-discover-place-result.png" width="380"> | <img src="10-discover-place-result.png" width="380"> |

### 11 — place with rating and reviews

| Before (006) | After (007) |
|---|---|
| <img src="before-007/10-place-with-rating-and-reviews.png" width="380"> | <img src="11-place-with-rating-and-reviews.png" width="380"> |

### 12 — chats inbox

| Before (006) | After (007) |
|---|---|
| <img src="before-007/11-chats-inbox.png" width="380"> | <img src="12-chats-inbox.png" width="380"> |

### 13 — new group empty

| Before (006) | After (007) |
|---|---|
| <img src="before-007/12-new-group-empty.png" width="380"> | <img src="13-new-group-empty.png" width="380"> |

### 14 — new group filled

| Before (006) | After (007) |
|---|---|
| <img src="before-007/13-new-group-filled.png" width="380"> | <img src="14-new-group-filled.png" width="380"> |

### 15 — group conversation

| Before (006) | After (007) |
|---|---|
| <img src="before-007/14-group-conversation.png" width="380"> | <img src="15-group-conversation.png" width="380"> |

### 16 — chats inbox with group

| Before (006) | After (007) |
|---|---|
| <img src="before-007/15-chats-inbox-with-group.png" width="380"> | <img src="16-chats-inbox-with-group.png" width="380"> |

### 17 — activity

| Before (006) | After (007) |
|---|---|
| <img src="before-007/16-activity.png" width="380"> | <img src="17-activity.png" width="380"> |

### 18 — profile

| Before (006) | After (007) |
|---|---|
| <img src="before-007/17-profile.png" width="380"> | <img src="18-profile.png" width="380"> |

### 19 — saved

| Before (006) | After (007) |
|---|---|
| <img src="before-007/18-saved.png" width="380"> | <img src="19-saved.png" width="380"> |

### 20 — edit profile

| Before (006) | After (007) |
|---|---|
| <img src="before-007/19-edit-profile.png" width="380"> | <img src="20-edit-profile.png" width="380"> |

### 21 — compose

| Before (006) | After (007) |
|---|---|
| <img src="before-007/20-compose.png" width="380"> | <img src="21-compose.png" width="380"> |
