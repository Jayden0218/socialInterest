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

  moderationLog: (yyyymm: string, timestamp: string, actionId: string) => ({
    pk: `MODLOG#${yyyymm}`,
    sk: `TS#${timestamp}#${actionId}`,
  }),

  notification: (recipientId: string, createdAt: string, notificationId: string) => ({
    pk: `USER#${recipientId}`,
    sk: `NOTIF#${createdAt}#${notificationId}`,
  }),

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
