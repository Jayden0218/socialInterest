# Feature Specification: A complete app — reach, depth and control

**Feature Branch**: `claude/spec-kit-integration-juhrza`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "from the current functionality, i want you add functionaly to my frontend and backend, for example in frontend, you can learn from interntet of big app what functonalit they have, and what can add to my app, and the backend, how does the post share to user" — followed by "should be a complete functionality of an app".

## How this scope was chosen

Two sources, and they disagreed usefully.

**Comparable products were surveyed.** Xiaohongshu — the product this app's design is
modelled on — is described as a hybrid of Instagram and Pinterest: notes mixing text,
images and short video, discovery by search and by "Nearby", and social interaction
through likes, comments, shares and follows. General guidance on building a social product
puts the launch set at feed, creation, profiles, notifications, messaging, search and
moderation, and is blunt that reporting and blocking belong from day one.

**Then the build was read, feature by feature.** That is what actually set the scope,
because the survey's headline finding was not a missing feature — it was a pattern.

### THE PATTERN: half-built features that look finished

Three separate cases, found independently, all the same shape — a field or a control
exists, is returned to the client or rendered on screen, and **the other half was never
written**:

| What the product declares | What is missing | Consequence |
|---|---|---|
| Publish screen: "**Up to 10 photos**" | Every render path reads `media[0]` | 9 of 10 photographs invisible **to everyone including the author, permanently** |
| Feed tab: "**Following**" | `HomeFeedScreen`'s own comment: *"'Following' is not built"* | A dead control on the primary surface |
| Notification `readAt`, returned to every client | **Nothing anywhere writes it** | Every notification is unread forever |

A fourth was found and fixed earlier in this session — a "New followers" notification you
could switch on that nothing could ever fire — which is why this is called a pattern and
not a coincidence. **Every P1 story below closes one of these**, because a promise the
product already makes and does not keep costs more than a feature it never claimed.

### What was verified absent, not assumed

Every item was checked against the source, and six first-pass results were **discarded as
false positives** — "typing" and "mention" matched prose in comments, `apns` matched
base64 inside a sample video, "mute" matched `text.muted`, and `locale` matched
`localeCompare`. Nothing below is claimed from memory:

**Content**: alt text, drafts, tagging people, hashtags, avatar image upload (`avatarUrl`
is declared and nothing can set it).
**Discovery**: post search by text (only interests and people are searchable), trending,
Nearby.
**Engagement**: reply to a comment, edit or delete your own comment, seeing who reacted.
**Messaging**: media in messages, unsending.
**Safety**: mute without blocking, hiding one post, appealing a moderation decision.
**Account**: private accounts, data export.
**Platform**: push notifications, localisation.

### What this spec does NOT add

- **Social commerce.** Xiaohongshu's closed-loop store is the largest thing it has that
  this product does not. It is a different business, not a missing feature.
- **Push notifications.** They need a hosted push service and a deployment target;
  003's hosting decision is the owner's and remains pending. Named so it is not forgotten.
- **Localisation.** No second locale has been asked for; building the machinery before the
  need is how it rots.
- **Nearby.** Places exist; a proximity feed needs device location, a permission prompt and
  a privacy position this product has not taken.

## User Scenarios & Testing *(mandatory)*

## Phase A — keep the promises already made

### User Story 1 - See the whole post (Priority: P1)

Someone publishes four photographs of a climb. Today the first is shown everywhere and the
other three exist only as rows nobody can reach. This makes every image in a post
reachable, in order, with the position shown.

**Why this priority**: The product promises "Up to 10 photos" in its own words, accepts
them, and charges the upload. Publishing content the product then hides is worse than
refusing it. Invisible to every existing test, because they all assert *a* post rendered.

**Independent Test**: Publish three ready images, open the post, reach the second and third.

**Acceptance Scenarios**:

1. **Given** a post with three ready images, **When** a viewer opens its detail, **Then**
   all three are reachable in publication order and the position in the set is shown.
2. **Given** a post with one image, **When** it is opened, **Then** no position indicator
   or navigation appears.
3. **Given** a post whose second image failed processing, **When** it is opened, **Then**
   the ready images remain reachable and the failure is accounted for, not skipped.
4. **Given** a multi-image post in the feed, **When** it is listed, **Then** the card shows
   there is more than one without the feed becoming a row of carousels.

---

### User Story 2 - Notifications that can be read (Priority: P1)

Opening the Activity tab marks nothing. `readAt` is returned to every client and written by
nothing, so every notification is unread forever and the tab can never be cleared.

**Why this priority**: It is a declared field with no writer — the same defect class as the
follow notification that could never fire. Anything built on unread counts, including a tab
badge, is built on a value that is always null.

**Independent Test**: Open Activity, return to it, and see previously-seen items marked
read and an unread count that falls.

**Acceptance Scenarios**:

1. **Given** unread notifications, **When** the viewer opens Activity, **Then** those
   notifications become read and stay read across app restarts.
2. **Given** read and unread notifications, **When** Activity is shown, **Then** unread ones
   are visually distinguishable.
3. **Given** unread notifications, **When** any surface shows a count, **Then** it reflects
   the true unread number.
4. **Given** a viewer, **When** they mark all as read, **Then** no notification of theirs
   remains unread, and no other person's notifications are affected.

---

### User Story 3 - The feed of people you chose (Priority: P1)

The feed shows "For you" and "Following". Only the first does anything. This makes the
second real: posts by followed people, newest first, no ranking, no exploration.

**Why this priority**: A rendered dead control on the primary surface. It misleads every
person who taps it, and it has been shipped through two device runs.

**Independent Test**: Follow one person, have them publish, see that post under Following
and nobody else's.

**Acceptance Scenarios**:

1. **Given** a viewer following two people, **When** they open Following, **Then** they see
   those people's posts newest first and nobody else's.
2. **Given** a viewer following nobody, **When** they open Following, **Then** they are told
   what the tab is for and how to fill it, not shown an error.
3. **Given** a post the viewer may not see, **When** its author is followed, **Then** it does
   not appear — following a person does not widen what they may see.
4. **Given** Following is read, **When** signals are inspected, **Then** none were recorded:
   a chronological list is not evidence of preference.

---

## Phase B — a post can travel, and a person can be seen

### User Story 4 - Send a post to anyone (Priority: P1)

A viewer can already share into a conversation that exists and is accepted, or read a URL
off the screen. This lets them pick any person, and hands the link to the device.

**Why this priority**: The half of the request that named the backend, and the narrowest
remaining gap in a mechanism that is otherwise built. A share that only works with existing
correspondents cannot introduce anyone to anything.

**Independent Test**: Send a post to somebody never messaged; confirm they receive it under
the same rules a first message follows.

**Acceptance Scenarios**:

1. **Given** a post, **When** the viewer sends it to a person they have no conversation
   with, **Then** it arrives as the opening message of a conversation REQUEST under the
   existing acceptance rules.
2. **Given** a post the recipient may not see, **When** it is sent, **Then** they receive no
   content and learn nothing of its existence.
3. **Given** a block in either direction, **When** a send is attempted, **Then** it is
   refused without revealing that a block is the reason.
4. **Given** a post open, **When** the viewer uses the device's own share mechanism,
   **Then** the link is handed to it.
5. **Given** a link sent earlier, **When** the post's visibility is later narrowed, **Then**
   the link resolves against current permission and shows nothing if it is gone.

---

### User Story 5 - A face on a profile (Priority: P1)

`avatarUrl` is declared on every profile and nothing in the product can set it. Every
avatar is a coloured initial. This lets a person upload a picture.

**Why this priority**: A fourth declared-and-unwritable field. It is also the single most
visible thing missing from a profile, on a product whose entire subject is photographs.

**Independent Test**: Set a profile picture and see it everywhere that person appears.

**Acceptance Scenarios**:

1. **Given** a person editing their profile, **When** they choose an image, **Then** it
   appears on their profile and everywhere their avatar is shown.
2. **Given** an uploaded avatar, **When** it is processed, **Then** it passes the same
   stripping and safety path as any other uploaded image.
3. **Given** a person with no avatar, **When** they are shown, **Then** the derived coloured
   initial is used, as today.
4. **Given** an avatar, **When** its owner removes it, **Then** the initial returns.

---

### User Story 6 - Find a post, not just an interest (Priority: P2)

Search reaches interests and people. It cannot reach posts. Somebody who remembers a phrase
from a caption cannot find it again.

**Why this priority**: Search is named in every survey of this product category as core
retention, and two thirds of it exists. Below Phase A because nothing is falsely advertised.

**Independent Test**: Publish a post with a distinctive caption; find it by typing part of
that caption.

**Acceptance Scenarios**:

1. **Given** posts with captions, **When** a viewer searches text, **Then** matching posts
   they may see are returned, most relevant first.
2. **Given** a post the viewer may not see, **When** it matches the query, **Then** it is
   absent from the results.
3. **Given** a query matching nothing, **When** results are shown, **Then** the viewer is
   told so and offered interests or people matching the same query.
4. **Given** a search, **When** it is performed, **Then** it records no behavioural ranking
   signal: looking for something is not the same as liking it.

---

## Phase C — depth in the things people do most

### User Story 7 - Reply to a comment (Priority: P2)

Comments are flat. Two people discussing one point look like six people making six remarks.

**Why this priority**: The most common structure in every comparable product, and the
difference between a comment section and a list of opinions.

**Independent Test**: Reply to a comment and see the reply attached to it.

**Acceptance Scenarios**:

1. **Given** a comment, **When** a viewer replies, **Then** the reply is shown with that
   comment, not appended to the end.
2. **Given** a comment with replies, **When** the parent is removed by moderation, **Then**
   the replies remain readable and the removal is stated in the parent's place.
3. **Given** a reply, **When** the viewer may not see the post, **Then** they may not see
   the reply — the boundary is the post's.
4. **Given** a deep exchange, **When** it is displayed, **Then** nesting is bounded so a
   thread cannot indent itself off screen.

---

### User Story 8 - Correct or withdraw what you said (Priority: P2)

A comment, once posted, is permanent. There is no edit and no delete.

**Why this priority**: The floor for user-generated text everywhere. Its absence is also a
safety issue: somebody who posts something they regret has no remedy but a report.

**Independent Test**: Post a comment, edit it, delete it; confirm the post's comment count
follows.

**Acceptance Scenarios**:

1. **Given** a comment they wrote, **When** the author edits it, **Then** the new text is
   shown and marked as edited.
2. **Given** a comment they wrote, **When** the author deletes it, **Then** it is gone from
   every surface and the count falls.
3. **Given** a comment somebody else wrote, **When** a viewer tries to change it, **Then**
   they are refused, server-side.
4. **Given** a deleted comment with replies, **When** it is shown, **Then** its replies
   survive, as in US7.

---

### User Story 9 - Mention a person (Priority: P2)

There is no way to bring somebody into a conversation or credit them in a caption.

**Why this priority**: The standard mechanism for drawing a specific person's attention,
and the natural companion to notifications now that those can be read.

**Independent Test**: Mention somebody in a comment and confirm they are notified and the
mention links to their profile.

**Acceptance Scenarios**:

1. **Given** a caption or comment, **When** it mentions a person by handle, **Then** the
   mention resolves to that profile and is tappable.
2. **Given** a mention, **When** it is published, **Then** the mentioned person is notified,
   subject to their notification preferences.
3. **Given** a mention of somebody who blocks the author, **When** it is published, **Then**
   no notification is delivered and no relationship is disclosed.
4. **Given** a mention of a handle that does not exist, **When** it is shown, **Then** it is
   plain text, not a broken link.

---

### User Story 10 - Say what is in the picture (Priority: P2)

No image can carry a description. The product is entirely photographs and none of them are
described to anybody who cannot see them.

**Why this priority**: Accessibility is a first-class concern in this product's own
constitution-era work — font scaling and touch targets are already enforced by tests — and
an undescribed image is the largest remaining gap. Also improves US6's search.

**Independent Test**: Publish an image with a description and confirm a screen reader
announces it.

**Acceptance Scenarios**:

1. **Given** a person publishing, **When** they add a description to an image, **Then** it
   is stored and announced by assistive technology wherever that image appears.
2. **Given** an image without a description, **When** it is shown, **Then** a sensible
   fallback is announced rather than silence or a file name.
3. **Given** a description, **When** the post is edited, **Then** the description can be
   edited too.

---

### User Story 11 - Finish it later (Priority: P3)

Leaving the publish screen loses everything: media, caption, interest, place.

**Why this priority**: The cost of losing a half-written post is a post never made. Lower
because nothing is broken — the work simply is not kept.

**Independent Test**: Start a post, leave, come back, and find it as it was.

**Acceptance Scenarios**:

1. **Given** a part-written post, **When** the person leaves the screen, **Then** it is kept
   as a draft.
2. **Given** a draft, **When** it is reopened, **Then** media, caption, interest and place
   are as they were.
3. **Given** a draft, **When** it is published or discarded, **Then** it stops being a draft.
4. **Given** a draft, **When** anybody else asks for it, **Then** it is not available.

---

## Phase D — control over what you see and who sees you

### User Story 12 - Less of this, without blocking (Priority: P2)

The only controls are follow and block. There is nothing between them: no muting a person
whose posts you would rather not see, and no dismissing a single post.

**Why this priority**: Blocking is a severe, relationship-ending act. Offering it as the
only remedy means people either endure content or over-escalate. It also gives the ranked
feed a negative signal it currently cannot receive.

**Independent Test**: Mute somebody and stop seeing their posts while remaining connected.

**Acceptance Scenarios**:

1. **Given** a person the viewer follows, **When** the viewer mutes them, **Then** their
   posts stop appearing while the follow and any conversation remain.
2. **Given** a muted person, **When** they are told anything, **Then** they are not: muting
   is invisible to its subject.
3. **Given** a post in the feed, **When** the viewer dismisses it, **Then** it does not
   return, and the ranking treats it as a negative signal.
4. **Given** a muted person, **When** the viewer unmutes, **Then** their posts return.

---

### User Story 13 - An account only your followers see (Priority: P2)

Every account is public. There is no way to publish to followers only as a standing choice.

**Why this priority**: Per-post visibility already exists; what is missing is the account
being private by default, which is the setting most people look for first.

**Independent Test**: Make an account private and confirm a non-follower sees nothing.

**Acceptance Scenarios**:

1. **Given** a private account, **When** a non-follower opens the profile, **Then** they see
   the person exists and none of their posts.
2. **Given** a private account, **When** somebody asks to follow, **Then** the request is
   held for approval rather than taking effect.
3. **Given** an account made private, **When** existing followers read, **Then** they keep
   access; visibility narrows for everyone else immediately, at read time.
4. **Given** a private account's post, **When** its link is opened by a non-follower,
   **Then** nothing is shown — the link confers no access.

---

### User Story 14 - Disagree with a moderation decision (Priority: P3)

Content can be removed. There is no way to say the removal was wrong.

**Why this priority**: Guidance on this product category is explicit that people must be
told why content was removed and given a route to contest it. Lower only because the
volume today is zero.

**Independent Test**: Have a post removed, appeal, and see the appeal recorded and
answerable.

**Acceptance Scenarios**:

1. **Given** removed content, **When** its author looks, **Then** they are told it was
   removed and why, in terms they can act on.
2. **Given** a removal, **When** the author appeals, **Then** the appeal is recorded and
   visible to moderators with the original context.
3. **Given** an appeal, **When** a moderator decides, **Then** the author is told the
   outcome.
4. **Given** an appeal, **When** anybody other than its author or a moderator asks for it,
   **Then** it is not available.

---

## Phase E — keeping what you found

### User Story 15 - Collections of saved posts (Priority: P3)

Saved posts are one list. This lets a person group and name them.

**Why this priority**: The natural end of a saved list longer than a screen, and saving is
already the strongest signal the ranker collects. Last because the list works.

**Independent Test**: Save two posts into different named collections and open one without
seeing the other's contents.

**Acceptance Scenarios**:

1. **Given** a saved post, **When** it is put in a named collection, **Then** it appears
   there and remains in the full saved list.
2. **Given** a collection, **When** anybody but its owner asks, **Then** it is unavailable.
3. **Given** a post in a collection, **When** it becomes invisible to the viewer, **Then**
   it is absent from the collection too.

---

### Edge Cases

- Images in one post finish processing at different times: the set must be navigable as
  soon as any is ready, not when the slowest finishes.
- Two devices open Activity at once: marking read must converge, not double-count.
- A followed author is muted: Following must respect the mute without the follow being lost.
- Someone follows several hundred accounts: Following must page like every other list.
- A reply is written to a comment deleted before submission: it must fail explaining itself.
- A mention names someone who blocks the author: no notification, no disclosure.
- An account is made private with a share link already circulating: the link must resolve
  against current permission.
- A collection is emptied: it survives — a named empty collection is a decision.
- A post carrying ten images at the largest platform font on the shortest screen: navigation
  between images stays reachable.
- An avatar is removed while cached elsewhere: surfaces converge on the initial.

## Requirements *(mandatory)*

### Functional Requirements

**Phase A — promises already made**

- **FR-001**: All ready media on a post MUST be reachable from its detail surface in
  publication order.
- **FR-002**: The detail surface MUST show position within a set of more than one, and MUST
  show no indicator for a single item.
- **FR-003**: A browse surface MUST indicate a post carries more than one item without
  becoming navigable per item.
- **FR-004**: Failed media MUST be accounted for on the detail surface and MUST remain
  visible only to the author.
- **FR-005**: Viewing notifications MUST mark them read, durably.
- **FR-006**: An unread count MUST be derivable and MUST reflect the true number.
- **FR-007**: A person MUST be able to mark all their notifications read, affecting nobody
  else's.
- **FR-008**: The Following surface MUST return posts by followed authors, newest first,
  with no ranking and no exploration.
- **FR-009**: The Following surface MUST NOT record behavioural ranking signals.
- **FR-010**: A viewer following nobody MUST be told what the surface is for.

**Phase B — reach**

- **FR-011**: A viewer MUST be able to send a post to a person with no existing conversation.
- **FR-012**: Such a send MUST create a conversation REQUEST and obey the existing request
  rules exactly.
- **FR-013**: A sent post MUST resolve against the RECIPIENT's visibility at read time.
- **FR-014**: A send a block forbids MUST be refused without revealing the block.
- **FR-015**: The share surface MUST hand the post's link to the device's share mechanism.
- **FR-016**: A share link MUST continue to confer no access of its own (001/FR-042).
- **FR-017**: A person MUST be able to set and remove a profile picture.
- **FR-018**: An uploaded avatar MUST pass the same processing and stripping path as any
  other uploaded image.
- **FR-019**: A person without an avatar MUST render the derived initial, as today.
- **FR-020**: Post text MUST be searchable, returning only posts the viewer may see.
- **FR-021**: Search MUST NOT record behavioural ranking signals.
- **FR-022**: A search with no matches MUST offer interests and people matching the query.

**Phase C — depth**

- **FR-023**: A comment MUST be able to name another comment on the same post as its parent.
- **FR-024**: Replies MUST display with their parent rather than in publication order.
- **FR-025**: Nesting MUST be bounded; a deeper reply MUST attach to the deepest permitted
  ancestor rather than being refused.
- **FR-026**: A moderated parent MUST leave its replies readable, with the removal stated.
- **FR-027**: A comment's author MUST be able to edit it, and it MUST be marked as edited.
- **FR-028**: A comment's author MUST be able to delete it, and counts MUST follow.
- **FR-029**: Editing or deleting somebody else's comment MUST be refused server-side.
- **FR-030**: Captions and comments MUST support mentioning a person by handle, resolving to
  their profile.
- **FR-031**: A mention MUST notify the mentioned person, subject to their preferences.
- **FR-032**: A mention MUST NOT notify or disclose anything across a block.
- **FR-033**: A mention of an unknown handle MUST render as plain text.
- **FR-034**: An image MUST be able to carry a description, announced by assistive
  technology wherever it appears.
- **FR-035**: An image without a description MUST announce a sensible fallback.
- **FR-036**: A description MUST be editable wherever the post is editable.
- **FR-037**: An unfinished post MUST be kept as a draft, restoring media, caption, interest
  and place.
- **FR-038**: A draft MUST be private to its author and MUST stop being a draft once
  published or discarded.

**Phase D — control**

- **FR-039**: A viewer MUST be able to mute a person: their posts stop appearing while the
  follow and any conversation remain.
- **FR-040**: A mute MUST be invisible to its subject.
- **FR-041**: A viewer MUST be able to dismiss a single post so it does not return.
- **FR-042**: A dismissal MUST be treated as a negative ranking signal.
- **FR-043**: An account MUST be settable to private, holding follow requests for approval.
- **FR-044**: A private account's posts MUST be unavailable to non-followers on every
  surface, decided at read time.
- **FR-045**: Existing followers MUST retain access when an account becomes private.
- **FR-046**: An author MUST be told when their content is removed, and why.
- **FR-047**: An author MUST be able to appeal a removal, and MUST be told the outcome.
- **FR-048**: An appeal MUST be readable only by its author and moderators.

**Phase E — keeping**

- **FR-049**: A person MUST be able to create named collections and place saved posts in
  them; a post MAY be in more than one.
- **FR-050**: A collection MUST be readable only by its owner on every surface.
- **FR-051**: A post in a collection MUST remain in the undifferentiated saved list.

**Throughout**

- **FR-052**: Every new read path MUST pass the single visibility boundary and appear in the
  visibility matrix contract (Constitution II).
- **FR-053**: Every new surface MUST carry stable test identifiers (006/FR-027).
- **FR-054**: Every new declared field MUST have a writer, and every new control a
  behaviour, before the story is called done — the defect class this feature exists to end.

### Key Entities

- **Media set**: media already attached to a post, now ordered and fully reachable, each
  able to carry a description.
- **Notification read state**: when a person saw a notification. The field exists; this
  gives it a writer.
- **Follow feed page**: a chronological page over followed authors, derived at read time.
- **Post send**: a post reference delivered into a conversation that may not have existed.
- **Avatar**: an image on a profile, processed like any other upload.
- **Comment parent**: an optional reference from a comment to another on the same post.
- **Mention**: a reference from text to a person.
- **Draft**: an unfinished post, private to its author.
- **Mute**: a one-way, invisible suppression of a person's posts for one viewer.
- **Dismissal**: a viewer's rejection of one post, and a negative ranking signal.
- **Account privacy**: whether a person's posts are open or followers-only by default.
- **Appeal**: an author's contest of a moderation decision.
- **Collection**: a named, private grouping of a person's saved posts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A post published with ten photographs shows all ten, counted from the detail
  surface against what was published.
- **SC-002**: Zero published media items are unreachable on any surface, across a fixture of
  single-image, multi-image, video and partially-failed posts.
- **SC-003**: After viewing, zero notifications remain unread, and the count matches the
  number genuinely unseen.
- **SC-004**: The Following surface returns only followed authors' posts, with zero
  unfollowed-author posts across a mixed fixture.
- **SC-005**: Reading Following or performing a search moves no ranking weight, measured by
  comparing the signal profile before and after.
- **SC-006**: A viewer can send a post to somebody never messaged and the recipient can open
  it, in under 30 seconds from the post being on screen.
- **SC-007**: A post sent to somebody who may not see it yields no content and no evidence
  of its existence, verified by the path a modified client would take.
- **SC-008**: A profile picture set once appears on 100% of surfaces showing that person.
- **SC-009**: A post is findable by any distinctive word in its caption, and unfindable by
  viewers who may not see it.
- **SC-010**: Replies display with their parent in 100% of cases across a fixture including
  replies-to-replies and a moderated parent.
- **SC-011**: 100% of images carry either a description or an announced fallback, measured
  across every rendering surface.
- **SC-012**: A draft restores media, caption, interest and place with zero fields lost.
- **SC-013**: A muted person's posts appear zero times for the muter, while the follow and
  any conversation survive.
- **SC-014**: A private account's posts are unavailable to non-followers on every enumerated
  surface, with zero leaks.
- **SC-015**: Every collection and every draft is unreadable by anyone but its owner, on
  every enumerated surface.
- **SC-016**: Every new read path appears in the visibility matrix with zero skipped rows.
- **SC-017**: Every control added by this feature is reachable at the largest platform font
  on the shortest supported screen.

## Assumptions

- **Sharing is not rebuilt.** The share link, its resolution against viewer permission, and
  posting into an existing conversation work and are left alone. US4 adds a recipient who is
  not yet a correspondent, and an exit to the system share sheet.
- **A post sent to a stranger is a message request**, reusing the existing rules rather than
  becoming a way to push content at people who have not agreed to hear from the sender.
- **Following is chronological and unranked.** Ranking it would make it a second "For you",
  which is the thing it exists to be an alternative to.
- **Reply nesting is bounded at one level.** Deeper trees are a display problem long before
  a data problem, and nothing here calls for them. **Worth challenging at planning.**
- **Post search is over caption and interest text**, not media content. Image understanding
  is a different feature with a different cost.
- **Mute is one-way and invisible**; dismissal is per post and permanent for that viewer.
- **Private accounts hold follow requests for approval**, which is the behaviour people
  expect from the setting's name.
- **Collections and drafts are private.** Public boards are a different feature with a
  different privacy surface.
- **No push notifications, no localisation, no Nearby, no commerce** — see the scoping
  section for why each is out.
- **Existing test identifiers are preserved** (006/FR-027 and its snapshot still bind).

## Dependencies

- The visibility boundary and the matrix contract — every story here adds read paths to it.
- The conversation request rules from 004/005, reused rather than reimplemented.
- The media upload and stripping pipeline from 001, reused for avatars.
- The ranked feed and signals from 007, which Following and search must NOT feed and which
  dismissal MUST feed negatively.
- The moderation queue from 005, extended by appeals.
- No new external service and nothing provisioned. Everything runs on the local profile.

## Scale, stated plainly

**This is not one feature.** Fifteen stories, 54 requirements and 17 criteria is several
features' worth of work, and calling it one would misrepresent it. It is written in five
phases so it can be delivered and verified in order:

- **Phase A (US1-3)** closes the three broken promises. Smallest, highest value, and the
  only phase that fixes something currently wrong rather than adding something absent.
- **Phase B (US4-6)** is reach: a post travels, a person has a face, content is findable.
- **Phase C (US7-11)** is depth in the daily actions.
- **Phase D (US12-14)** is control and trust.
- **Phase E (US15)** is retention.

**Phase A alone is a coherent release** and is the recommended first cut.
