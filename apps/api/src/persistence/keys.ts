/**
 * Key builders. These MUST match data-model.md § Key schema exactly - the access
 * patterns A1..A20 are only served if these strings are right, and a mismatch is
 * silent (a query simply returns nothing).
 */
export const keys = {
  person: (userId: string) => ({ pk: `USER#${userId}`, sk: '#PROFILE' }),

  /**
   * 007/B1 - a person's signal profile: the running total the ranker reads.
   *
   * One item, read once per feed request, so the hottest path costs one GetItem.
   * It lives in the person's own partition because it is theirs alone: no index
   * makes it reachable from anywhere else, which is the storage-level half of
   * Principle III's promise that nobody else can read it.
   */
  signalProfile: (userId: string) => ({ pk: `USER#${userId}`, sk: '#SIGNALPROFILE' }),

  /**
   * 007/B3 - one recorded observation, with a TTL.
   *
   * These exist so that "clear my signals" can be VERIFIED as clearing
   * something, and so a folding bug can be diagnosed against what happened
   * rather than against a total. Never read on the feed path.
   */
  signalEvent: (userId: string, at: string, postId: string) => ({
    pk: `USER#${userId}`,
    sk: `SIGNAL#${at}#${postId}`,
  }),

  /**
   * 007/B6 - the interests chosen at first run.
   *
   * DELIBERATELY NOT an interest follow. Storing seeds as follows would
   * recreate the subscription feed 007 removes, because every later reader
   * treats a follow as a follow. A distinct key makes "these are a seed"
   * structural rather than a convention someone has to remember (research R4).
   */
  seedInterests: (userId: string) => ({ pk: `USER#${userId}`, sk: '#SEEDINTERESTS' }),
  personByHandle: (handleLower: string) => ({ gsi1pk: `HANDLE#${handleLower}`, gsi1sk: '#PROFILE' }),

  /**
   * A34 (004/FR-034) - people, searchable by handle PREFIX.
   *
   * `personByHandle` is an exact-match partition key, so it cannot answer "who
   * starts with jo". This puts every person in one partition sorted by handle,
   * on GSI3 (Hierarchy: children under a parent) - the same shape places under a
   * locality use, so no sixth index is needed.
   *
   * ONE PARTITION FOR EVERY PERSON is a hot partition, and it is the honest
   * limit of this design: it is right for a product with no users and wrong for
   * one with a million. Display-name matching is a bounded filter over the same
   * partition. Both are the 001/D3 trade again - the friction is concentrated
   * behind one interface, and a real search backend replaces it there.
   */
  personSearch: (handleLower: string) => ({
    gsi3pk: 'PEOPLE',
    gsi3sk: `HANDLE#${handleLower}`,
  }),

  /**
   * An issued upload target. Persisted so POST /posts can quote an uploadId alone
   * (the contract's PostCreate) and the server derives key and kind from its own
   * record - rather than trusting a client-supplied key, which let a caller point
   * a post at another person's media.
   */
  upload: (uploadId: string) => ({ pk: `UPLOAD#${uploadId}`, sk: '#META' }),

  /**
   * A pending domain event, awaiting its handlers.
   *
   * One partition so unhandled events can be found on startup without a scan.
   * The item is DELETED once every handler has run - the store holds only what
   * is still outstanding, so the partition stays small and "what is unhandled"
   * needs no flag to interpret.
   */
  pendingEvent: (eventId: string) => ({ pk: 'EVENTS#PENDING', sk: `EVENT#${eventId}` }),

  post: (postId: string) => ({ pk: `POST#${postId}`, sk: '#META' }),
  postByAuthor: (authorId: string, createdAt: string, postId: string) => ({
    gsi2pk: `USER#${authorId}`,
    gsi2sk: `TS#${createdAt}#${postId}`,
  }),
  /** Media items share the post's partition so A3 is a single Query. */
  mediaItem: (postId: string, ordinal: number) => ({
    pk: `POST#${postId}`,
    sk: `MEDIA#${String(ordinal).padStart(3, '0')}`,
  }),

  /** One per interest in the post's expanded set - sub-interest AND parent (FR-024). */
  postInterestIndex: (interestId: string, createdAt: string, postId: string) => ({
    pk: `INTEREST#${interestId}`,
    sk: `POST#${createdAt}#${postId}`,
  }),
  postInterestIndexPrefix: (interestId: string) => ({ pk: `INTEREST#${interestId}`, skPrefix: 'POST#' }),

  /**
   * 008/A46 - posts containing a term. A CANDIDATE INDEX, never a decision.
   *
   * Structurally identical to `postInterestIndex` and `postPlaceIndex`, which is
   * what makes post search one more row in the visibility matrix rather than a
   * new class of thing. It selects; `VisibilityFilter` decides.
   *
   * It carries `visibility` and `processingState` for the same reason those two
   * do - so the filter runs on Query results without a second read per
   * candidate - and therefore it MUST join the fan-out in
   * `post-update.transaction.ts`. That file's own comment says an index item
   * whose visibility drifts from the post's "is exactly the SC-009 failure this
   * class exists to make impossible", and a term row is one more index item.
   */
  postTermIndex: (token: string, createdAt: string, postId: string) => ({
    pk: `TERM#${token}`,
    sk: `POST#${createdAt}#${postId}`,
  }),
  postTermIndexPrefix: (token: string) => ({ pk: `TERM#${token}`, skPrefix: 'POST#' }),

  interest: (interestId: string) => ({ pk: `INTEREST#${interestId}`, sk: '#META' }),
  interestBySlug: (slug: string) => ({ gsi1pk: `ISLUG#${slug}`, gsi1sk: '#META' }),
  interestHierarchy: (parentId: string | null, nameNormalised: string) => ({
    gsi3pk: `PARENT#${parentId ?? 'ROOT'}`,
    gsi3sk: `NAME#${nameNormalised}`,
  }),

  interestFollow: (userId: string, interestId: string) => ({
    pk: `USER#${userId}`,
    sk: `IFOLLOW#${interestId}`,
  }),
  interestFollowInverted: (interestId: string, userId: string) => ({
    gsi4pk: `INTEREST#${interestId}`,
    gsi4sk: `IFOLLOWER#${userId}`,
  }),

  /** A10 - the authority for FR-015. A point read on the viewer's partition. */
  personFollow: (followerId: string, followeeId: string) => ({
    pk: `USER#${followerId}`,
    sk: `PFOLLOW#${followeeId}`,
  }),
  personFollowInverted: (followeeId: string, followerId: string) => ({
    gsi4pk: `USER#${followeeId}`,
    gsi4sk: `PFOLLOWER#${followerId}`,
  }),

  /** Key structure enforces "at most one reaction per person per post" (FR-039). */
  reaction: (postId: string, userId: string) => ({ pk: `POST#${postId}`, sk: `REACTION#${userId}` }),
  comment: (postId: string, createdAt: string, commentId: string) => ({
    pk: `POST#${postId}`,
    sk: `COMMENT#${createdAt}#${commentId}`,
  }),

  block: (blockerId: string, blockedId: string) => ({
    pk: `USER#${blockerId}`,
    sk: `BLOCK#${blockedId}`,
  }),
  blockInverted: (blockedId: string, blockerId: string) => ({
    gsi4pk: `USER#${blockedId}`,
    gsi4sk: `BLOCKEDBY#${blockerId}`,
  }),

  report: (reportId: string) => ({ pk: `REPORT#${reportId}`, sk: '#META' }),
  reportByState: (state: string, createdAt: string) => ({
    gsi1pk: `RSTATE#${state}`,
    gsi1sk: `TS#${createdAt}`,
  }),

  /**
   * 008/A53, A54 — AN APPEAL, KEYED EXACTLY LIKE A REPORT.
   *
   * Deliberately identical in shape rather than merely similar: the queue is one
   * Query, a transition moves it between queues with one write, and the ordering
   * is oldest-first for the same reason SC-010 needs it on reports — newest-first
   * quietly starves the oldest, and an appeal nobody reaches is a refusal with
   * extra steps.
   */
  appeal: (appealId: string) => ({ pk: `APPEAL#${appealId}`, sk: '#META' }),
  appealByState: (state: string, createdAt: string) => ({
    gsi1pk: `ASTATE#${state}`,
    gsi1sk: `TS#${createdAt}`,
  }),
  /**
   * A54. A POINTER ROW IN THE AUTHOR'S OWN PARTITION.
   *
   * "My appeals" would otherwise be a scan of every appeal, filtered — which is
   * the shape that works with ten appeals and stops working with ten thousand,
   * silently, by getting slower. The row carries the id and nothing else; the
   * appeal itself stays in one place, so there is no second copy to drift.
   */
  appealByAuthor: (authorId: string, createdAt: string, appealId: string) => ({
    pk: `USER#${authorId}`,
    sk: `APPEALBY#${createdAt}#${appealId}`,
  }),

  moderationLog: (yyyymm: string, timestamp: string, actionId: string) => ({
    pk: `MODLOG#${yyyymm}`,
    sk: `TS#${timestamp}#${actionId}`,
  }),

  /**
   * 008/A57, FR-046 — WHAT THE AUTHOR IS TOLD, IN THE AUTHOR'S OWN PARTITION.
   *
   * The append-only log is partitioned BY MONTH, which is right for an audit
   * trail and useless for "what was removed of mine": answering that from
   * `MODLOG#` is a scan of every decision anyone ever made, filtered. So the
   * same event is also written here, addressed to the person it happened to.
   *
   * Written by the SAME call that appends the log (`ModerationLogRepository`
   * takes the recipient), so a removal that is logged and never explained is not
   * expressible. FR-046's "and why" is the reported REASON and the action taken
   * — never the moderator's free-text note, which is internal and would leak
   * both the reporter's words and the queue's own workings.
   */
  moderationNotice: (recipientId: string, timestamp: string, actionId: string) => ({
    pk: `USER#${recipientId}`,
    sk: `MODNOTICE#${timestamp}#${actionId}`,
  }),

  notification: (recipientId: string, createdAt: string, notificationId: string) => ({
    pk: `USER#${recipientId}`,
    sk: `NOTIF#${createdAt}#${notificationId}`,
  }),

  /**
   * 008/A43 - when this person last read their notifications.
   *
   * ONE ITEM, beside `#SIGNALPROFILE` in the person's own partition, and the
   * same shape as the read watermark conversations already keep on the
   * participant row (`ConversationRepository.markRead`). One pattern applied
   * twice rather than a second invention.
   *
   * `readAt` on the response is DERIVED from this (see read-watermark.ts). The
   * field has been declared on every notification and returned to every client
   * since 001 with NOTHING WRITING IT, so every notification was unread forever.
   *
   * Deliberately NO stored unread counter, which is the one thing not copied
   * from the conversation row: a count and the rows it counts are two sources of
   * truth for one fact, and nothing here needs a counter to be cheap.
   */
  notificationRead: (userId: string) => ({ pk: `USER#${userId}`, sk: '#NOTIFREAD' }),

  // ---------------------------------------------------------------- feature 004

  /**
   * A conversation's authoritative state (004/A23).
   *
   * `conversationId` is DERIVED from the sorted participant pair - see
   * conversation-id.ts. That is what makes "open a conversation" idempotent with
   * no uniqueness item and no race: two people tapping at once compute the same
   * id and write the same partition.
   */
  conversation: (conversationId: string) => ({ pk: `CONV#${conversationId}`, sk: '#META' }),

  /** Messages share the conversation partition so A24 is one cursor Query. */
  message: (conversationId: string, messageId: string) => ({
    pk: `CONV#${conversationId}`,
    sk: `MSG#${messageId}`,
  }),

  /**
   * The inbox row. Two per conversation, one per participant.
   *
   * `state` is in the GSI5 partition key so the accepted inbox and the requests
   * inbox (FR-003) are one Query each rather than one Query and a filter.
   * `lastMessageAt` is a GSI SORT key, so it is updated by writing the attribute -
   * no delete-and-reinsert, which is the trap in a `CONV#<lastMessageAt>#<id>` sk.
   */
  conversationParticipant: (userId: string, conversationId: string) => ({
    pk: `USER#${userId}`,
    sk: `CONV#${conversationId}`,
  }),
  conversationInbox: (userId: string, state: string, lastMessageAt: string) => ({
    gsi5pk: `USER#${userId}#${state}`,
    gsi5sk: `TS#${lastMessageAt}`,
  }),

  place: (placeId: string) => ({ pk: `PLACE#${placeId}`, sk: '#META' }),
  /** A26 - the dedupe lookup. Uniqueness is per LOCALITY, not global (FR-014). */
  placeBySlug: (locality: string, slug: string) => ({
    gsi1pk: `PSLUG#${locality}#${slug}`,
    gsi1sk: '#META',
  }),
  /**
   * A27 - the locality catalogue, on GSI3.
   *
   * GSI3 is the Hierarchy index ("children under a parent"). Places under a
   * locality is exactly that shape, so no sixth index is needed.
   */
  placeByLocality: (locality: string, nameNormalised: string) => ({
    gsi3pk: `LOCALITY#${locality}`,
    gsi3sk: `NAME#${nameNormalised}`,
  }),

  /**
   * A28. Structurally identical to postInterestIndex, deliberately - which is what
   * makes the place page one more row in the visibility matrix rather than a new
   * class of test. At most ONE per post (FR-015).
   */
  postPlaceIndex: (placeId: string, createdAt: string, postId: string) => ({
    pk: `PLACE#${placeId}`,
    sk: `POST#${createdAt}#${postId}`,
  }),
  postPlaceIndexPrefix: (placeId: string) => ({ pk: `PLACE#${placeId}`, skPrefix: 'POST#' }),

  placeFollow: (userId: string, placeId: string) => ({
    pk: `USER#${userId}`,
    sk: `PLFOLLOW#${placeId}`,
  }),
  placeFollowInverted: (placeId: string, userId: string) => ({
    gsi4pk: `PLACE#${placeId}`,
    gsi4sk: `PLFOLLOWER#${userId}`,
  }),

  /**
   * A32 - a person's saved posts, newest save first.
   *
   * Private BY KEY: it lives under the owner's own partition and no index projects
   * it, so there is no query anyone else can write that reaches it (FR-038).
   */
  savedPost: (userId: string, savedAt: string, postId: string) => ({
    pk: `USER#${userId}`,
    sk: `SAVE#${savedAt}#${postId}`,
  }),
  /**
   * A55, A56 - 008/FR-049 to FR-051. COLLECTIONS, PRIVATE BY KEY.
   *
   * The owner's own partition and no index, exactly like `savedPost` and
   * `draft`: FR-050 says a collection is readable only by its owner, and the
   * cheapest way to keep a promise like that is to make the query that would
   * break it unwriteable. The service's authorisation check is the second lock,
   * not the only one.
   *
   * THE MEMBERSHIP ROW CARRIES THE COLLECTION ID FIRST, so "posts in this
   * collection" is one Query on a prefix. `savedAt` before `postId` gives
   * newest-first within a collection, and putting the post id last means a post
   * can sit in several collections without any of them colliding — which is
   * FR-049's "a post MAY be in more than one" expressed in the key rather than
   * enforced by a check.
   */
  collection: (ownerId: string, collectionId: string) => ({
    pk: `USER#${ownerId}`,
    sk: `COLLECTION#${collectionId}`,
  }),
  collectionItem: (ownerId: string, collectionId: string, savedAt: string, postId: string) => ({
    pk: `USER#${ownerId}`,
    sk: `COLLITEM#${collectionId}#${savedAt}#${postId}`,
  }),
  /**
   * THE MARKER, and it exists for the same reason `savedPostBy` does.
   *
   * The membership row's sort key carries `savedAt`, which a caller asking "is
   * this post already on this shelf" does not know — so without this, that
   * question is a scan of the whole collection, on every add and every remove.
   * That shape works with ten posts and stops working by getting slower, which
   * is the failure mode this codebase already solved once for saves and then
   * did not apply here until it was read back.
   */
  collectionItemBy: (ownerId: string, collectionId: string, postId: string) => ({
    pk: `USER#${ownerId}`,
    sk: `COLLBY#${collectionId}#${postId}`,
  }),

  /**
   * A49 - 008/FR-037. AN UNFINISHED POST, PRIVATE BY KEY.
   *
   * The owner's own partition and no index, exactly like `savedPost` above: the
   * privacy is a property of where it lives, not a filter somebody has to
   * remember to apply. FR-038 says a draft is visible to nobody else, and the
   * cheapest way to keep a promise like that is to make the query that would
   * break it unwriteable.
   *
   * Newest first is the useful order for a list of things you meant to finish,
   * which is why the id is a ULID and the sort key is the id alone.
   */
  draft: (userId: string, draftId: string) => ({
    pk: `USER#${userId}`,
    sk: `DRAFT#${draftId}`,
  }),

  /**
   * A50 - 008/FR-039, FR-040. MUTE, WITH NO INVERTED INDEX.
   *
   * The absence of an index IS the privacy mechanism, not a rule somebody has
   * to remember: the row lives only in the MUTER's partition, so there is no
   * query the muted person can write that reaches it. FR-040 says a mute must
   * not be inferable by its subject, and a structural answer to that outlives
   * every future surface, which a filter on a response does not.
   *
   * Deliberately unlike `block`, which IS indexed both ways — a block has to be
   * enforceable from either side, and a mute must not be visible from one.
   */
  mute: (muterId: string, mutedId: string) => ({
    pk: `USER#${muterId}`,
    sk: `MUTE#${mutedId}`,
  }),

  /**
   * A51 - 008/FR-041. A post this viewer asked not to see again.
   *
   * Also private by key, and for a second reason: a dismissal is a negative
   * signal about somebody's content (FR-042), and an index that let an author
   * count dismissals would be a scoreboard of who disliked them.
   */
  dismissal: (viewerId: string, postId: string) => ({
    pk: `USER#${viewerId}`,
    sk: `DISMISS#${postId}`,
  }),

  /** A33 - "is this saved?" without scanning the list. */
  savedPostBy: (userId: string, postId: string) => ({
    pk: `USER#${userId}`,
    sk: `SAVEDBY#${postId}`,
  }),

  // ---------------------------------------------------------------- feature 005

  /**
   * A35 (005/FR-002) - one person's rating of one place.
   *
   * THE KEY ENFORCES "at most one rating per person per place". A second rating
   * writes the same key, so the constraint cannot be violated by any code path
   * and no test needs to prove that every path checks it. Same argument as
   * `reaction`, which is why FR-039 needed no uniqueness logic either.
   *
   * The place partition now holds three sk shapes - `#META`, `POST#...` and
   * `RATING#...` - which is the intended use of an overloaded key. Both list
   * prefixes are explicit so a query for one cannot scan the other.
   */
  rating: (placeId: string, userId: string) => ({
    pk: `PLACE#${placeId}`,
    sk: `RATING#${userId}`,
  }),
  ratingPrefix: (placeId: string) => ({ pk: `PLACE#${placeId}`, skPrefix: 'RATING#' }),

  /**
   * A36 - "have I rated this?" without reading a place's ratings.
   *
   * Under the PERSON's own partition, a base-table item rather than an index -
   * the same shape as `savedPostBy`, and private by key for the same reason.
   */
  ratingByPerson: (userId: string, placeId: string) => ({
    pk: `USER#${userId}`,
    sk: `RATED#${placeId}`,
  }),

  /**
   * A40 (005/FR-025) - every participant of a conversation.
   *
   * Participation was stored only under the PERSON's partition, which answers
   * "am I in this?" but cannot list a conversation's members without already
   * knowing them. That was fine for a pair, where `participantIds` on the meta
   * item IS the answer, and is not fine for a group whose membership changes.
   *
   * Mirrors how media items share a post's partition so A3 is one Query. Two
   * rows per participation, one under each partition, written in the same
   * transaction - the cost of A40 being a query rather than a scan.
   */
  conversationMember: (conversationId: string, userId: string) => ({
    pk: `CONV#${conversationId}`,
    sk: `PARTICIPANT#${userId}`,
  }),
  conversationMemberPrefix: (conversationId: string) => ({
    pk: `CONV#${conversationId}`,
    skPrefix: 'PARTICIPANT#',
  }),
} as const;

export const SK_PREFIX = {
  interestFollow: 'IFOLLOW#',
  personFollow: 'PFOLLOW#',
  block: 'BLOCK#',
  post: 'POST#',
  comment: 'COMMENT#',
  reaction: 'REACTION#',
  media: 'MEDIA#',
  notification: 'NOTIF#',
  // feature 004
  conversation: 'CONV#',
  message: 'MSG#',
  placeFollow: 'PLFOLLOW#',
  savedPost: 'SAVE#',
  collection: 'COLLECTION#',
  // feature 008
  draft: 'DRAFT#',
  mute: 'MUTE#',
  dismissal: 'DISMISS#',
  // feature 005
  rating: 'RATING#',
  conversationMember: 'PARTICIPANT#',
} as const;

/** Item discriminators for the `type` attribute (004). */
export const ITEM_TYPE_004 = {
  conversation: 'conversation',
  conversationParticipant: 'conversation-participant',
  message: 'message',
  place: 'place',
  placePostIndex: 'place-post-index',
  placeFollow: 'place-follow',
  savedPost: 'saved-post',
} as const;

/** Item discriminators for the `type` attribute (005). */
export const ITEM_TYPE_005 = {
  rating: 'rating',
  conversationMember: 'conversation-member',
} as const;

/**
 * ===========================================================================
 * THE OVERLAY NAMESPACE — RESERVED, SO UPSTREAM CAN NEVER ALLOCATE IT.
 * ===========================================================================
 *
 * This is a SINGLE-TABLE design, and a downstream fork's entities live in the
 * same table as upstream's. That is the right answer - a fork needs no second
 * table, no migration and no separate stack - and it has exactly one hazard,
 * which this namespace exists to remove.
 *
 * THE HAZARD. A fork adds a widget under its owner's partition and picks the
 * obvious sort key, `WIDGET#<id>`. Some months later upstream adds a widget of
 * its own and picks the same obvious prefix. Now two different entity kinds
 * share one key shape in one partition: a prefix Query returns both, and each
 * row is deserialised as whatever the reader expected. It is not a merge
 * conflict - the two changes are in different files and merge cleanly - and it
 * is not a test failure either, because each side's tests pass against its own
 * data. It is silent corruption discovered later, in production, by a reader
 * that got a row of the wrong shape.
 *
 * THE FIX. Every overlay key is namespaced under a leading `X#` token that
 * upstream promises never to use, so `X#WIDGET#1` cannot collide with any
 * `WIDGET#1` upstream ever invents. The promise is not a convention anybody has
 * to remember: `overlay-key-namespace.spec.ts` calls EVERY builder in `keys`
 * and fails if any of them emits a key in the reserved space. Enumerated rather
 * than hand-listed, for the reason `auth-surface.spec.ts` records - a
 * hand-picked list only ever covers the mistakes you have already made.
 *
 * It is short (`X#`, not `OVERLAY#`) because it is a prefix on every key of
 * every overlay row, and DynamoDB charges for key bytes.
 */
export const OVERLAY_KEY_PREFIX = 'X#';

/** The same reservation for the `type` discriminator attribute. */
export const OVERLAY_ITEM_TYPE_PREFIX = 'x-';

const OVERLAY_NAMESPACE_PATTERN = /^[A-Z][A-Z0-9]*$/;

function assertNamespace(namespace: string): void {
  if (!OVERLAY_NAMESPACE_PATTERN.test(namespace)) {
    throw new Error(
      `overlay key namespace must be uppercase alphanumeric, got ${JSON.stringify(namespace)}. ` +
        'A namespace containing "#" would add a segment and break the key structure, which is ' +
        'the silent kind of key defect this file exists to prevent.',
    );
  }
}

/**
 * Build an overlay key value: `overlayKey('WIDGET', id)` -> `X#WIDGET#<id>`.
 *
 * Use it for both halves - a new top-level partition (`pk`) and a row under an
 * existing partition (`sk`) - so a fork gets the namespace right by
 * construction rather than by remembering it.
 */
export function overlayKey(namespace: string, ...parts: readonly string[]): string {
  assertNamespace(namespace);
  return [OVERLAY_KEY_PREFIX.replace('#', ''), namespace, ...parts].join('#');
}

/** The Query prefix for one overlay namespace: `X#WIDGET#`. */
export function overlayKeyPrefix(namespace: string): string {
  assertNamespace(namespace);
  return `${overlayKey(namespace)}#`;
}

/** Build an overlay `type` discriminator: `overlayItemType('widget')` -> `x-widget`. */
export function overlayItemType(name: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(
      `overlay item type must be lowercase kebab-case, got ${JSON.stringify(name)}.`,
    );
  }
  return `${OVERLAY_ITEM_TYPE_PREFIX}${name}`;
}
