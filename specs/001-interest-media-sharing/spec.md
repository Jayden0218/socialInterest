# Feature Specification: Interest-Centred Media Sharing

**Feature Branch**: `claude/spec-kit-integration-juhrza`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "i want to build an social app that user can upload their image and video to the app, and share with each other, and the main focus of the post and video is on interest."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish media to an interest (Priority: P1)

A person opens the app, picks one or more photos or a video from their device, chooses the interest the content belongs to (for example "film photography", "bouldering", "sourdough"), adds a short caption, and publishes. The post appears in that interest's space and on the person's own profile.

**Why this priority**: Without published content there is nothing to browse, follow, or share. This is the smallest slice that produces a working product — a person can put media into the app and see it appear under an interest.

**Independent Test**: Can be fully tested by signing in, uploading one image and one video against a chosen interest, and confirming both render correctly in that interest's space and on the author's profile. Delivers value on its own as a personal interest-organised media archive.

**Acceptance Scenarios**:

1. **Given** a signed-in person on the create screen, **When** they select an image, assign it to an interest, and publish, **Then** the post is visible in that interest's space within 5 seconds and on their own profile.
2. **Given** a signed-in person selecting a video within the supported size and length limits, **When** they publish, **Then** the video uploads with visible progress and becomes playable once processing completes.
3. **Given** a person composing a post, **When** they attempt to publish without assigning an interest, **Then** publishing is blocked and they are told an interest is required.
4. **Given** an upload in progress, **When** the network drops, **Then** the person is told the upload failed and can retry without re-selecting the media.

---

### User Story 2 - Discover content by interest (Priority: P2)

A person browses the app by interest rather than by who they know. They open an interest, see recent and popular posts within it, and can move between related interests to find more.

**Why this priority**: This is the differentiator — the app is organised around interests, not around a friend graph. It turns a personal archive into a place worth visiting, but requires published content to exist first.

**Independent Test**: Can be tested by seeding posts across several interests, then confirming that opening any interest shows only its posts, ordered sensibly, with working pagination.

**Acceptance Scenarios**:

1. **Given** an interest with published posts, **When** a person opens it, **Then** they see those posts and no posts from unrelated interests.
2. **Given** an interest with no posts yet, **When** a person opens it, **Then** they see an empty state inviting them to be the first to post.
3. **Given** a person browsing an interest, **When** they scroll to the end of the loaded posts, **Then** older posts load without losing their scroll position.
4. **Given** a person searching for an interest by name, **When** they type a partial name, **Then** matching interests appear as they type.

---

### User Story 3 - Follow interests to build a personal feed (Priority: P3)

A person follows the interests they care about. Their home feed is assembled from those interests, so the app opens onto content that matches what they actually want to see.

**Why this priority**: Turns discovery into retention — a reason to return. Depends on discovery existing, but the app is usable without it.

**Independent Test**: Can be tested by following three interests, publishing posts across followed and unfollowed interests, and confirming the home feed contains only posts from followed interests.

**Acceptance Scenarios**:

1. **Given** a person viewing an interest they do not follow, **When** they choose to follow it, **Then** it is added to their followed interests and its posts begin appearing in their home feed.
2. **Given** a person who follows no interests, **When** they open the home feed, **Then** they are prompted to choose interests, with suggestions shown.
3. **Given** a person who unfollows an interest, **When** they return to the home feed, **Then** posts from that interest no longer appear.

---

### User Story 4 - Engage with and share posts (Priority: P4)

A person reacts to a post, leaves a comment, and shares a post outward via a link so someone outside the app can view it.

**Why this priority**: Engagement is what makes it social rather than a gallery, and outward sharing brings new people in. Valuable but not required for the core loop to function.

**Independent Test**: Can be tested by reacting to and commenting on a post as a second account, confirming both are visible to the author, and opening a generated share link in a signed-out session.

**Acceptance Scenarios**:

1. **Given** a person viewing a post, **When** they react to it, **Then** the reaction count updates immediately and persists across sessions.
2. **Given** a person viewing a post, **When** they submit a comment, **Then** it appears under the post attributed to them.
3. **Given** a person viewing a publicly visible post, **When** they copy its share link and open it while signed out, **Then** the post is viewable with a prompt to join.
4. **Given** a post that has been deleted, **When** someone opens a previously shared link to it, **Then** they see a clear "no longer available" message rather than an error.

---

### User Story 5 - Manage your profile and your content (Priority: P5)

A person maintains a profile showing who they are and the interests they post about, and can edit, delete, or re-file their own posts.

**Why this priority**: Necessary for trust and control, and expected of any social product, but the app demonstrates its value before this exists.

**Independent Test**: Can be tested by editing a caption, moving a post to a different interest, and deleting a post, confirming each change is reflected everywhere the post appeared.

**Acceptance Scenarios**:

1. **Given** a person viewing their own post, **When** they edit the caption or change its interest, **Then** the change is reflected in every place the post appears.
2. **Given** a person viewing their own post, **When** they delete it, **Then** it is removed from all interest spaces, feeds, and their profile.
3. **Given** a person viewing another person's profile, **When** the profile loads, **Then** they see that person's public posts and the interests they most often post about.

---

### Edge Cases

- A person selects a file type the app does not support (e.g. a document or an unsupported codec) — publishing is refused with an explanation of what is accepted.
- A video exceeds the maximum size or duration — the person is told the limit before the upload begins, not after it completes.
- An upload is interrupted by network loss or the app being backgrounded — the partial upload is discarded or resumed, and the person is never left with a half-published post.
- A person publishes the same media repeatedly in quick succession — rate limiting prevents flooding an interest space.
- Media contains content that violates the content policy — it can be reported, reviewed, and removed, and the reporter is told the outcome.
- Media carries embedded location data — location is stripped unless the person explicitly chooses to include it.
- An interest is created that duplicates an existing one under a different spelling — near-duplicates are surfaced during creation so people converge on one.
- A person's account is deleted — their posts and comments are removed or anonymised according to the stated retention policy.
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

**Interests**

- **FR-013**: System MUST organise every post under one or more named interests.
- **FR-014**: System MUST provide a browsable space per interest showing the posts assigned to it.
- **FR-015**: System MUST let a person search for interests by name with results appearing as they type.
- **FR-016**: System MUST let a person follow and unfollow interests.
- **FR-017**: System MUST surface interests a person may want to follow when they have followed few or none.
- **FR-018**: System MUST determine how new interests come into existence [NEEDS CLARIFICATION: is the interest list a curated catalogue maintained by the operator, or can any person create a new interest freely?]

**Feeds and discovery**

- **FR-019**: System MUST provide a home feed composed of posts from the interests a person follows.
- **FR-020**: System MUST load additional older posts as a person scrolls, without losing their position.
- **FR-021**: System MUST show a helpful empty state wherever a feed or interest space has no content.

**Social graph and sharing**

- **FR-022**: System MUST define how people connect to each other [NEEDS CLARIFICATION: do people follow only interests, only other people, or both — and does following a person affect the home feed?]
- **FR-023**: System MUST allow a person to react to a post, with the count visible to everyone who can see the post.
- **FR-024**: System MUST allow a person to comment on a post, attributed to them.
- **FR-025**: System MUST let a person generate a shareable link to a post they are allowed to see.
- **FR-026**: System MUST show a clear "no longer available" message when a shared link points to deleted or newly restricted content.

**Visibility and safety**

- **FR-027**: System MUST define who can see a given post [NEEDS CLARIFICATION: is all content public by default, or do people choose per-post visibility such as public / followers-only / private?]
- **FR-028**: System MUST allow any person to report a post or comment they believe violates the content policy.
- **FR-029**: System MUST allow a person to block another person, hiding that person's content and preventing them from interacting.
- **FR-030**: System MUST provide operators a way to review reported content and remove it, notifying the author when their content is removed.
- **FR-031**: System MUST rate-limit publishing and commenting to prevent flooding.
- **FR-032**: System MUST record moderation actions so decisions can be audited later.

**Notifications**

- **FR-033**: System MUST notify a person when someone reacts to or comments on their post.
- **FR-034**: System MUST let a person turn each category of notification off.

### Key Entities

- **Person**: Someone with an account. Has a display name, avatar, bio, the interests they follow, the posts they authored, and their blocks and notification preferences.
- **Post**: A published unit of media. Has one or more images or a single video, a caption, an author, one or more assigned interests, a visibility setting, a creation time, and its reactions and comments.
- **Media Item**: An individual image or video within a post. Has a type, dimensions, duration for video, a thumbnail, and a processing state.
- **Interest**: A named topic that posts are organised under. Has a name, an optional description, the posts assigned to it, and its followers.
- **Interest Follow**: The link between a person and an interest they follow, with the time it began.
- **Reaction**: A person's positive signal on a post, at most one per person per post.
- **Comment**: A person's text response on a post, with an author and a creation time.
- **Report**: A person's flag on a post or comment, with a reason, a state, and the moderation outcome.
- **Block**: One person's suppression of another, hiding content in both directions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new person can go from opening the app to publishing their first post in under 3 minutes.
- **SC-002**: 95% of image uploads under 10 MB complete within 10 seconds on a typical mobile connection.
- **SC-003**: A published video is playable within 60 seconds of the upload finishing, for 95% of uploads.
- **SC-004**: 90% of people succeed in publishing their first post on the first attempt, without abandoning the flow.
- **SC-005**: Interest spaces and feeds display their first content within 2 seconds for 95% of views.
- **SC-006**: A person who has just signed up can find and follow at least 3 interests relevant to them within 2 minutes.
- **SC-007**: 70% of posts published are assigned to an interest that already has other posts, indicating people converge on shared interests rather than fragmenting.
- **SC-008**: Reported content receives a moderation decision within 24 hours for 95% of reports.
- **SC-009**: The system supports 10,000 people browsing concurrently without a noticeable slowdown in feed loading.
- **SC-010**: 40% of people who publish a first post publish a second within 7 days.

## Assumptions

- The product is consumer-facing and reached primarily from mobile devices; a browsing experience on larger screens is expected but mobile is the priority.
- People have intermittent but generally usable network connectivity; uploads must tolerate interruption.
- Accounts use standard email-and-password or third-party sign-in; no enterprise identity integration is needed.
- Supported media are common consumer formats — JPEG, PNG, HEIC, WebP for images and MP4/MOV for video. Uncommon codecs are out of scope for the first release.
- Video is short-form: a duration cap in the range of a few minutes is assumed, with the exact limit set during planning.
- Content is retained until its author deletes it or an operator removes it; deleted content is purged on an industry-standard timeline.
- Direct/private messaging between people is out of scope for the first release.
- Live streaming, ephemeral stories, and in-app editing filters are out of scope for the first release.
- Monetisation, advertising, and creator payouts are out of scope for the first release.
- Automated content classification may assist moderation, but a human review path is assumed to exist for contested decisions.
- The interest space is expected to serve a general audience; no age-restricted or regulated content categories are planned for the first release.
