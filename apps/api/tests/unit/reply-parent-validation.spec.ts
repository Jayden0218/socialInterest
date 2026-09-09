import { validReplyParent } from '../../src/modules/engagement/reply-parent';

/**
 * 008/T109, US7 — A PARENT MUST BE A COMMENT ON THE SAME POST.
 *
 * Without this, a `parentCommentId` from another post is either stored (and the
 * listing silently drops a reply nothing can group) or dereferenced (and a
 * comment thread confirms the existence of a comment on a post the viewer may
 * not be able to open). The second is a disclosure, which is why this is
 * checked rather than tolerated.
 *
 * A pure function, so the rule is testable without a datastore — and so the
 * service cannot express it differently from the test.
 */
describe('008/US7 reply parent validation', () => {
  const parents = [
    { commentId: 'C1', postId: 'P1', parentCommentId: null },
    { commentId: 'C2', postId: 'P1', parentCommentId: 'C1' },
  ];

  it('accepts a top-level comment on the same post', () => {
    expect(validReplyParent(parents, 'P1', 'C1')).toEqual({ ok: true, parentCommentId: 'C1' });
  });

  it('RE-PARENTS a reply to a reply onto its root (FR-025)', () => {
    expect(validReplyParent(parents, 'P1', 'C2')).toEqual({ ok: true, parentCommentId: 'C1' });
  });

  it('refuses a parent that is not a comment on this post', () => {
    expect(validReplyParent(parents, 'P2', 'C1')).toEqual({ ok: false });
    expect(validReplyParent(parents, 'P1', 'MISSING')).toEqual({ ok: false });
  });

  it('treats an absent parent as a top-level comment', () => {
    expect(validReplyParent(parents, 'P1', undefined)).toEqual({ ok: true, parentCommentId: null });
  });
});
