# Feature Specification: Interest-Centred Media Sharing

**Feature Branch**: `claude/spec-kit-integration-juhrza`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "i want to build an social app that user can upload their image and video to the app, and share with each other, and the main focus of the post and video is on interest."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish media to an interest (Priority: P1)

A person opens the app, picks one or more photos or a video from their device, chooses the interest the content belongs to (for example "film photography" under Photography, or "bouldering" under Climbing), adds a short caption, sets who may see it, and publishes. The post appears in that interest's space and on the person's own profile.

**Why this priority**: Without published content there is nothing to browse, follow, or share. This is the smallest slice that produces a working product — a person can put media into the app and see it appear under an interest.

**Independent Test**: Can be fully tested by signing in, uploading one image and one video against a chosen interest, and confirming both render correctly in that interest's space and on the author's profile. Delivers value on its own as a personal interest-organised media archive.

**Acceptance Scenarios**:

1. **Given** a signed-in person on the create screen, **When** they select an image, assign it to an interest, and publish, **Then** the post is visible in that interest's space within 5 seconds and on their own profile.
2. **Given** a signed-in person selecting a video within the supported size and length limits, **When** they publish, **Then** the video uploads with visible progress and becomes playable once processing completes.
3. **Given** a person composing a post, **When** they attempt to publish without assigning an interest, **Then** publishing is blocked and they are told an interest is required.
4. **Given** a person composing a post, **When** they publish without changing the visibility control, **Then** the post is published as public.
5. **Given** a person composing a post, **When** they set visibility to followers-only and publish, **Then** the post is visible to their followers and to nobody else.
6. **Given** an upload in progress, **When** the network drops, **Then** the person is told the upload failed and can retry without re-selecting the media.

---

### User Story 2 - Discover content by interest (Priority: P2)

A person browses the app by interest rather than by who they know. They open a top-level interest, see the sub-interests within it and the posts across them, and can drill into a sub-interest or move sideways to related ones.

**Why this priority**: This is the differentiator — the app is organised around interests, not around a friend graph. It turns a personal archive into a place worth visiting, but requires published content to exist first.

**Independent Test**: Can be tested by seeding posts across several sub-interests under different parents, then confirming that opening any interest shows its own posts plus those of its sub-interests, and nothing from unrelated branches.

**Acceptance Scenarios**:

1. **Given** a sub-interest with published posts, **When** a person opens it, **Then** they see those posts and no posts from unrelated interests.
2. **Given** a top-level interest containing several sub-interests, **When** a person opens it, **Then** they see its sub-interests listed and a combined view of the posts within them.
3. **Given** an interest with no posts yet, **When** a person opens it, **Then** they see an empty state inviting them to be the first to post.
4. **Given** a person browsing an interest, **When** they scroll to the end of the loaded posts, **Then** older posts load without losing their scroll position.
5. **Given** a person searching for an interest by name, **When** they type a partial name, **Then** matching top-level and sub-interests appear as they type, each showing its parent.

---

### User Story 3 - Follow interests to build a personal feed (Priority: P3)

A person follows the interests they care about, at either level. Their home feed is assembled from those interests, so the app opens onto content that matches what they actually want to see.

**Why this priority**: Turns discovery into retention — a reason to return. Depends on discovery existing, but the app is usable without it.

**Independent Test**: Can be tested by following three interests, publishing posts across followed and unfollowed interests, and confirming the home feed contains only posts from followed interests.

**Acceptance Scenarios**:

1. **Given** a person viewing an interest they do not follow, **When** they choose to follow it, **Then** it is added to their followed interests and its posts begin appearing in their home feed.
2. **Given** a person who follows a top-level interest, **When** a post is published to any of its sub-interests, **Then** that post is eligible for their home feed.
3. **Given** a person who follows no interests, **When** they open the home feed, **Then** they are prompted to choose interests, with suggestions shown.
4. **Given** a person who unfollows an interest, **When** they return to the home feed, **Then** posts from that interest no longer appear.

---

### User Story 4 - Follow people within the interests you care about (Priority: P4)

A person finds someone whose work they like and follows them. That person's posts are given prominence in the feed — but only inside interests the follower has themselves chosen. Following someone never pulls in content from interests the follower has no stake in.

**Why this priority**: Rewards strong contributors with an audience, which is what keeps them posting, while preserving interest as the organising principle. The app functions without it, so it sits behind the interest loop.

**Independent Test**: Can be tested by following a person who posts across two interests, following only one of those interests, and confirming that only their posts in the followed interest reach the home feed.

**Acceptance Scenarios**:

1. **Given** a person viewing another person's profile, **When** they choose to follow them, **Then** the follow is recorded and both parties' follower counts update.
2. **Given** a person who follows another person, **When** that person publishes to an interest the follower also follows, **Then** the post appears in the follower's home feed with prominence over unfollowed authors' posts.
3. **Given** a person who follows another person, **When** that person publishes to an interest the follower does not follow, **Then** the post does not appear in the follower's home feed.
4. **Given** a person viewing a profile, **When** the profile loads, **Then** they see that person's visible posts, their follower and following counts, and the interests they most often post about.

---

### User Story 5 - Engage with and share posts (Priority: P5)

A person reacts to a post, leaves a comment, and shares a post outward via a link — with the link honouring whatever visibility the author chose.

**Why this priority**: Engagement is what makes it social rather than a gallery, and outward sharing brings new people in. Valuable but not required for the core loop to function.

**Independent Test**: Can be tested by reacting to and commenting on a post as a second account, confirming both are visible to the author, and opening a generated share link in a signed-out session for both a public and a followers-only post.

**Acceptance Scenarios**:

1. **Given** a person viewing a post, **When** they react to it, **Then** the reaction count updates immediately and persists across sessions.
2. **Given** a person viewing a post, **When** they submit a comment, **Then** it appears under the post attributed to them.
3. **Given** a public post, **When** someone opens its share link while signed out, **Then** the post is viewable with a prompt to join.
4. **Given** a followers-only post, **When** someone who does not follow the author opens its share link, **Then** they are shown a "not available to you" message rather than the content.
5. **Given** a post that has been deleted or switched to private, **When** someone opens a previously shared link to it, **Then** they see a clear "no longer available" message rather than an error.

---

### User Story 6 - Manage your profile and your content (Priority: P6)

A person maintains a profile showing who they are and the interests they post about, and can edit, delete, re-file, or change the visibility of their own posts.

**Why this priority**: Necessary for trust and control, and expected of any social product, but the app demonstrates its value before this exists.

**Independent Test**: Can be tested by editing a caption, moving a post to a different interest, narrowing its visibility, and deleting it, confirming each change is reflected everywhere the post appeared.

**Acceptance Scenarios**:

1. **Given** a person viewing their own post, **When** they edit the caption or change its interest, **Then** the change is reflected in every place the post appears.
2. **Given** a person viewing their own public post, **When** they change it to private, **Then** it disappears from all other people's feeds, interest spaces, and search results, and its share links stop resolving.
3. **Given** a person viewing their own post, **When** they delete it, **Then** it is removed from all interest spaces, feeds, and their profile.

---

### Edge Cases

- A person selects a file type the app does not support (e.g. a document or an unsupported codec) — publishing is refused with an explanation of what is accepted.
- A video exceeds the maximum size or duration — the person is told the limit before the upload begins, not after it completes.
- An upload is interrupted by network loss or the app being backgrounded — the partial upload is discarded or resumed, and the person is never left with a half-published post.
- A person publishes the same media repeatedly in quick succession — rate limiting prevents flooding an interest space.
- Someone creates a sub-interest that duplicates an existing one under the same parent — near-matches are surfaced during creation so people join the existing one instead.
- The same sub-interest name is created under two different parents (e.g. "portraits" under both Photography and Painting) — both are permitted and disambiguated by their parent wherever they appear.
- A sub-interest is created under the wrong parent — it can be re-parented, and its posts move with it.
- A sub-interest name itself violates the content policy — it can be reported and renamed or retired independently of the posts inside it.
- A top-level interest is retired while its sub-interests still hold posts — the posts are not orphaned; sub-interests are re-parented or the retirement is blocked.
- Two sub-interests are merged — posts from both land in the surviving interest and followers of either are carried across.
- A person unfollows someone whose followers-only posts they have already seen — those posts stop being visible, including in any share links they saved.
- Media carries embedded location data — location is stripped unless the person explicitly chooses to include it.
- A person's account is deleted — their posts and comments are removed or anonymised according to the stated retention policy, and their followers-only content becomes inaccessible.
- A person blocks someone who follows them — the follow is severed in both directions and previously visible followers-only content is withdrawn.
- A person opens the app with no network connection — previously loaded content remains viewable and new actions queue rather than failing silently.
- An interest space grows very large — browsing and search remain responsive as post counts grow.

## Requirements *(mandatory)*

### Functional Requirements

**Accounts and identity**

- **FR-001**: System MUST allow a person to create an account and sign in.
- **FR-002**: System MUST allow a person to set a display name, avatar, and short bio on their profile.
- **FR-003**: System MUST allow a person to delete their account and be told what happens to their content.

**Publishing**

- **FR-004**: System MUST allow a signed-in person to upload one or more images in common formats as a single post.
- **FR-005**: System MUST allow a signed-in person to upload a video as a post, within published size and duration limits.
- **FR-006**: System MUST require every post to be assigned to at least one interest before it can be published.
- **FR-007**: System MUST allow a person to add a text caption to a post.
- **FR-008**: System MUST show upload progress and allow a failed upload to be retried without re-selecting the media.
- **FR-009**: System MUST prepare uploaded video for smooth playback and display a thumbnail before playback begins.
- **FR-010**: System MUST strip embedded location metadata from uploaded media unless the person explicitly opts to keep it.
- **FR-011**: System MUST allow a person to edit the caption and interest assignment of their own posts.
- **FR-012**: System MUST allow a person to delete their own posts, removing them from every surface where they appeared.

**Post visibility**

- **FR-013**: System MUST let the author choose a post's visibility at publish time from public, followers-only, or private, defaulting to public.
- **FR-014**: System MUST make a public post visible to everyone, including people who are not signed in.
- **FR-015**: System MUST make a followers-only post visible to the author and to the people who follow the author, and to nobody else.
- **FR-016**: System MUST make a private post visible only to its author.
- **FR-017**: System MUST let an author change a post's visibility after publishing, applying the change immediately everywhere the post appears.
- **FR-018**: System MUST enforce post visibility consistently on every surface — interest spaces, home feeds, profiles, search results, share links, and notifications.

**Interests**

- **FR-019**: System MUST organise every post under one or more named interests.
- **FR-020**: System MUST structure interests as two levels: a curated set of top-level interests and sub-interests nested beneath them.
- **FR-021**: System MUST let operators create, rename, and retire top-level interests.
- **FR-022**: System MUST let any signed-in person create a sub-interest beneath exactly one top-level interest.
- **FR-023**: System MUST surface existing sub-interests with similar names under the same parent while a person is creating a new one, so they can join the existing one instead.
- **FR-024**: System MUST make a post published to a sub-interest also appear in its parent interest's space.
- **FR-025**: System MUST provide a browsable space per interest showing its posts and, for a top-level interest, its sub-interests.
- **FR-026**: System MUST let a person search for interests by name with results appearing as they type, covering both levels and showing each sub-interest's parent.
- **FR-027**: System MUST let a person follow and unfollow interests at either level.
- **FR-028**: System MUST treat a follow of a top-level interest as covering posts in all of its sub-interests.
- **FR-029**: System MUST surface interests a person may want to follow when they have followed few or none.
- **FR-030**: System MUST let operators re-parent, merge, and retire sub-interests, carrying posts and followers across without orphaning content.
- **FR-031**: System MUST apply the content policy to sub-interest names and allow them to be reported.

**Feeds and discovery**

- **FR-032**: System MUST provide a home feed composed of posts from the interests a person follows.
- **FR-033**: System MUST restrict posts from followed people to those published in interests the viewer also follows; following a person MUST NOT introduce posts from interests the viewer does not follow.
- **FR-034**: System MUST give posts by followed people greater prominence than posts by unfollowed authors within the same interest.
- **FR-035**: System MUST load additional older posts as a person scrolls, without losing their position.
- **FR-036**: System MUST show a helpful empty state wherever a feed or interest space has no content.

**Social graph and sharing**

- **FR-037**: System MUST let a person follow and unfollow another person.
- **FR-038**: System MUST show on a profile the person's visible posts, their follower and following counts, and the interests they post to most.
- **FR-039**: System MUST allow a person to react to a post, with the count visible to everyone who can see the post.
- **FR-040**: System MUST allow a person to comment on a post, attributed to them.
- **FR-041**: System MUST let a person generate a shareable link to a post they are allowed to see.
- **FR-042**: System MUST resolve a share link only for viewers permitted by the post's current visibility, and show a clear "no longer available" or "not available to you" message otherwise.

**Visibility and safety**

- **FR-043**: System MUST allow any person to report a post, comment, or sub-interest name they believe violates the content policy.
- **FR-044**: System MUST allow a person to block another person, hiding content in both directions, severing any follow between them, and preventing further interaction.
- **FR-045**: System MUST provide operators a way to review reported content and remove it, notifying the author when their content is removed.
- **FR-046**: System MUST rate-limit publishing, commenting, and sub-interest creation to prevent flooding.
- **FR-047**: System MUST record moderation actions so decisions can be audited later.

**Notifications**

- **FR-048**: System MUST notify a person when someone reacts to or comments on their post, or follows them.
- **FR-049**: System MUST let a person turn each category of notification off.

### Key Entities

- **Person**: Someone with an account. Has a display name, avatar, bio, the interests they follow, the people they follow and are followed by, the posts they authored, and their blocks and notification preferences.
- **Post**: A published unit of media. Has one or more images or a single video, a caption, an author, one or more assigned interests, a visibility setting (public, followers-only, or private), a creation time, and its reactions and comments.
- **Media Item**: An individual image or video within a post. Has a type, dimensions, duration for video, a thumbnail, and a processing state.
- **Interest**: A named topic that posts are organised under. Has a name, a level (top-level or sub-interest), a parent interest when it is a sub-interest, the person or operator who created it, an optional description, its posts, and its followers.
- **Interest Follow**: The link between a person and an interest they follow, with the time it began.
- **Person Follow**: The link between a follower and the person they follow, with the time it began. Governs who can see followers-only posts and which posts gain prominence within followed interests.
- **Reaction**: A person's positive signal on a post, at most one per person per post.
- **Comment**: A person's text response on a post, with an author and a creation time.
- **Report**: A person's flag on a post, comment, or sub-interest name, with a reason, a state, and the moderation outcome.
- **Block**: One person's suppression of another, hiding content in both directions and severing follows.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new person can go from opening the app to publishing their first post in under 3 minutes.
- **SC-002**: 95% of image uploads under 10 MB complete within 10 seconds on a typical mobile connection.
- **SC-003**: A published video is playable within 60 seconds of the upload finishing, for 95% of uploads.
- **SC-004**: 90% of people succeed in publishing their first post on the first attempt, without abandoning the flow.
- **SC-005**: Interest spaces and feeds display their first content within 2 seconds for 95% of views.
- **SC-006**: A person who has just signed up can find and follow at least 3 interests relevant to them within 2 minutes.
- **SC-007**: 70% of posts published are assigned to a sub-interest that already has other posts, indicating people converge on shared interests rather than fragmenting.
- **SC-008**: Fewer than 10% of newly created sub-interests are later merged away as duplicates, indicating the duplicate warning works.
- **SC-009**: No post is ever shown to a viewer its visibility setting excludes, verified across every surface.
- **SC-010**: Reported content receives a moderation decision within 24 hours for 95% of reports.
- **SC-011**: The system supports 10,000 people browsing concurrently without a noticeable slowdown in feed loading.
- **SC-012**: 40% of people who publish a first post publish a second within 7 days.

## Assumptions

- The product is consumer-facing and reached primarily from mobile devices; a browsing experience on larger screens is expected but mobile is the priority.
- People have intermittent but generally usable network connectivity; uploads must tolerate interruption.
- Accounts use standard email-and-password or third-party sign-in; no enterprise identity integration is needed.
- Supported media are common consumer formats — JPEG, PNG, HEIC, WebP for images and MP4/MOV for video. Uncommon codecs are out of scope for the first release.
- Video is short-form: a duration cap in the range of a few minutes is assumed, with the exact limit set during planning.
- The interest hierarchy is exactly two levels deep. Sub-interests do not nest further; if deeper structure proves necessary it is a later change.
- The operator seeds a starting catalogue of top-level interests before launch; the app is not usable without one.
- A post may be assigned to interests at either level, but assigning it to a sub-interest is the expected case.
- Person-following is one-directional; there is no mutual-friend or request-to-follow concept in the first release.
- A person's follower list is not itself private; follower and following counts are visible on profiles.
- Content is retained until its author deletes it or an operator removes it; deleted content is purged on an industry-standard timeline.
- Direct/private messaging between people is out of scope for the first release.
- Live streaming, ephemeral stories, and in-app editing filters are out of scope for the first release.
- Monetisation, advertising, and creator payouts are out of scope for the first release.
- Automated content classification may assist moderation, but a human review path is assumed to exist for contested decisions.
- The interest space is expected to serve a general audience; no age-restricted or regulated content categories are planned for the first release.
