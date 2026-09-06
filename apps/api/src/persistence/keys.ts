/**
 * Key builders. These MUST match data-model.md § Key schema exactly - the access
 * patterns A1..A20 are only served if these strings are right, and a mismatch is
 * silent (a query simply returns nothing).
 */
export const keys = {
  person: (userId: string) => ({ pk: `USER#${userId}`, sk: '#PROFILE' }),
  personByHandle: (handleLower: string) => ({ gsi1pk: `HANDLE#${handleLower}`, gsi1sk: '#PROFILE' }),

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
} as const;
