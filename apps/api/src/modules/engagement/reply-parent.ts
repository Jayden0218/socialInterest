/**
 * 008/US7, FR-023 and FR-025 — WHICH COMMENT A REPLY ATTACHES TO.
 *
 * A pure function over the thread's existing rows, so the rule is testable
 * without a datastore and the service cannot express it differently from its
 * test. Two decisions live here:
 *
 * 1. A parent must be a comment ON THIS POST. A `parentCommentId` from another
 *    post is not merely untidy — dereferencing it would let a comment thread
 *    confirm the existence of a comment on a post the viewer may not open.
 * 2. NESTING IS BOUNDED AT ONE LEVEL, and a deeper reply is RE-PARENTED rather
 *    than refused (FR-025). Somebody answering a reply has done nothing wrong
 *    and must not be told so; the display bound is ours, not theirs. The stored
 *    graph stays truthful because what is stored is the ancestor actually
 *    attached to, never a lie about what was clicked.
 */
export interface ReplyParentRow {
  commentId: string;
  postId: string;
  parentCommentId: string | null;
}

export type ReplyParentDecision = { ok: true; parentCommentId: string | null } | { ok: false };

export function validReplyParent(
  rows: ReplyParentRow[],
  postId: string,
  parentCommentId: string | null | undefined,
): ReplyParentDecision {
  if (!parentCommentId) return { ok: true, parentCommentId: null };
  const parent = rows.find((c) => c.commentId === parentCommentId && c.postId === postId);
  if (!parent) return { ok: false };
  // The deepest PERMITTED ancestor: a reply's own parent is already top level,
  // so one hop is always enough at this bound.
  return { ok: true, parentCommentId: parent.parentCommentId ?? parent.commentId };
}

/**
 * FR-024 — PARENT, THEN ITS REPLIES BY TIME, THEN THE NEXT PARENT.
 *
 * Ordering is a property of the RESPONSE, not of the sort key: `A15` lists a
 * post's comments with one Query on `COMMENT#<createdAt>#<id>`, and changing
 * that key to encode a thread would cost the single-Query listing this design
 * exists for. So the rows arrive in time order and are grouped here.
 *
 * A reply whose parent is not in this page keeps its position in time rather
 * than being dropped: a comment nobody can see is worse than one shown out of
 * its group, and paging must not lose content.
 */
export function groupWithParents<T extends { commentId: string; parentCommentId?: string | null }>(
  items: T[],
): T[] {
  const present = new Set(items.map((c) => c.commentId));
  const repliesOf = new Map<string, T[]>();
  for (const item of items) {
    const parent = item.parentCommentId;
    if (!parent || !present.has(parent)) continue;
    const list = repliesOf.get(parent) ?? [];
    list.push(item);
    repliesOf.set(parent, list);
  }
  const out: T[] = [];
  for (const item of items) {
    const parent = item.parentCommentId;
    if (parent && present.has(parent)) continue;
    out.push(item);
    for (const reply of repliesOf.get(item.commentId) ?? []) out.push(reply);
  }
  return out;
}
