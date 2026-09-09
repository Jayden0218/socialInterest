import { shareWarning, isShareable } from '../features/engagement/ShareAction';

/**
 * 008/T224 — WHEN A RULE CHANGES, GREP THE COPY, NOT ONLY THE CODE.
 *
 * `shareWarning` handled every value of `Visibility` and was still wrong the
 * moment US13 shipped: a `public` post by a PRIVATE account is evaluated by the
 * `followers` rule, so the sheet's silence — which reads as "anyone can open
 * this" — became a promise the boundary does not keep.
 *
 * Nothing in the code would have shown it. The post's visibility really is
 * `public`, the switch really is exhaustive, and the type checker really is
 * satisfied. 007 shipped a follow hint describing a WITHDRAWN requirement for
 * the same reason, and that is the lesson this file exists to hold onto.
 */
describe('008/FR-044 the share warning tells the truth about a private account', () => {
  it('says nothing for a public post by an open account', () => {
    expect(shareWarning('public')).toBeNull();
    expect(shareWarning('public', false)).toBeNull();
  });

  it('warns for a public post by a PRIVATE account, which is the case that was wrong', () => {
    const warning = shareWarning('public', true);
    expect(warning).not.toBeNull();
    // It names the ACCOUNT, not the post: the post is public and saying
    // otherwise would send the person to change a setting that is not the one.
    expect(warning).toMatch(/account is private/i);
  });

  it('is unchanged for followers-only and private posts, private account or not', () => {
    expect(shareWarning('followers', true)).toEqual(shareWarning('followers', false));
    expect(shareWarning('private', true)).toEqual(shareWarning('private', false));
  });

  /**
   * A private ACCOUNT does not make a post unshareable — the link still opens
   * for the people who were approved. Only a private POST does.
   */
  it('a private account does not disable sharing', () => {
    expect(isShareable('public')).toBe(true);
    expect(isShareable('private')).toBe(false);
  });
});
