# The 20 screens, before and after feature 006 — SC-008

**After** is the current build, recaptured by
`apps/e2e/scripts/capture-screens.ts` against a running API, on the same
fixtures and the same viewport as the before set. **Before** is the same
script's output at commit `1bcfd00`, extracted so the pair sits in one place
rather than in two points of history.

## What this evidence is, and what it is not

These are **react-native-web in headless Chromium**. They render the same React
components through DOM primitives, so they show the tokens, the type roles, the
post card and the interest colours - and they say nothing about native layout,
fonts, safe areas, touch targets as fingers hit them, or image decode on a real
device. Constitution Principle V: *emulation is not evidence*. The device run
is `.github/workflows/android-emulator.yml`, and it is what makes 006 verified.

Two differences are worth naming before scrolling, because they are the whole
feature:

- **Media renders at all.** The before column shows no media: an empty grey box
  where a post's image belongs (07), and nothing at all in the lists. It is not
  that the design was plainer - the app could not fetch its own media, because
  nothing ever issued a readable URL for an object in a private bucket. 006/R4b
  added presigned GET URLs, issued only to a viewer who has already passed
  `VisibilityFilter`.
- **Every interest has its own colour**, derived from its id, so two interest
  spaces are told apart at a glance. Before, every space was identical chrome
  around different text - the thing the product is organised around had no
  visual presence at all.

### 01 — feed signed out

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/01-feed-signed-out.png" width="380"> | <img src="01-feed-signed-out.png" width="380"> |

### 02 — sign in

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/02-sign-in.png" width="380"> | <img src="02-sign-in.png" width="380"> |

### 03 — home feed

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/03-home-feed.png" width="380"> | <img src="03-home-feed.png" width="380"> |

### 04 — discover search

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/04-discover-search.png" width="380"> | <img src="04-discover-search.png" width="380"> |

### 05 — discover results

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/05-discover-results.png" width="380"> | <img src="05-discover-results.png" width="380"> |

### 06 — interest space

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/06-interest-space.png" width="380"> | <img src="06-interest-space.png" width="380"> |

### 07 — post detail

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/07-post-detail.png" width="380"> | <img src="07-post-detail.png" width="380"> |

### 08 — comments

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/08-comments.png" width="380"> | <img src="08-comments.png" width="380"> |

### 09 — discover place result

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/09-discover-place-result.png" width="380"> | <img src="09-discover-place-result.png" width="380"> |

### 10 — place with rating and reviews

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/10-place-with-rating-and-reviews.png" width="380"> | <img src="10-place-with-rating-and-reviews.png" width="380"> |

### 11 — chats inbox

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/11-chats-inbox.png" width="380"> | <img src="11-chats-inbox.png" width="380"> |

### 12 — new group empty

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/12-new-group-empty.png" width="380"> | <img src="12-new-group-empty.png" width="380"> |

### 13 — new group filled

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/13-new-group-filled.png" width="380"> | <img src="13-new-group-filled.png" width="380"> |

### 14 — group conversation

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/14-group-conversation.png" width="380"> | <img src="14-group-conversation.png" width="380"> |

### 15 — chats inbox with group

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/15-chats-inbox-with-group.png" width="380"> | <img src="15-chats-inbox-with-group.png" width="380"> |

### 16 — activity

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/16-activity.png" width="380"> | <img src="16-activity.png" width="380"> |

### 17 — profile

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/17-profile.png" width="380"> | <img src="17-profile.png" width="380"> |

### 18 — saved

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/18-saved.png" width="380"> | <img src="18-saved.png" width="380"> |

### 19 — edit profile

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/19-edit-profile.png" width="380"> | <img src="19-edit-profile.png" width="380"> |

### 20 — compose

| Before (pre-006) | After (006) |
|---|---|
| <img src="before-006/20-compose.png" width="380"> | <img src="20-compose.png" width="380"> |

