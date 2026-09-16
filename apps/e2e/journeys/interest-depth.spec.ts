import { actor } from '../support/client';
import { freshInterestName, publishReadyImage, publishReadyNamingInterest } from '../support/publish';
import type { Post } from '@sih/shared';

/**
 * 004/US3. An interest page worth opening.
 *
 * The case that matters is SC-009: an alternative ordering may change the
 * ORDER and must never change the MEMBERSHIP. A "Top" tab that quietly ran its
 * own query would be a second visibility decision, which Constitution II
 * forbids - and it would look completely fine on screen.
 *
 * 013. EVERY INTEREST HERE IS CREATED BY PUBLISHING INTO IT. `interests.create`
 * is gone with `POST /v1/interests`, because it produced an interest with no
 * posts — which FR-004 makes unrepresentable. So the fixture post that used to
 * follow the create IS the create now, and the tests that counted posts count
 * it.
 */
describe('004/US3 - an interest page is worth opening', () => {
  it('FR-025 an interest creator can edit its description, and it is read back', async () => {
    const creator = await actor('descCreator');
    const { interestId } = await publishReadyNamingInterest(creator, freshInterestName('Described'));

    await creator.data.interests.setDescription(interestId, 'What this interest is for.');
    const after = await creator.data.interests.get(interestId);
    expect(after.description).toBe('What this interest is for.');
  }, 120_000);

  it('FR-025 somebody else cannot rewrite a description they did not create', async () => {
    const creator = await actor('descOwner');
    const stranger = await actor('descStranger');
    const { interestId } = await publishReadyNamingInterest(creator, freshInterestName('Guarded'));
    await creator.data.interests.setDescription(interestId, 'mine');

    await expect(
      stranger.data.interests.setDescription(interestId, 'not yours'),
    ).rejects.toMatchObject({ status: 403 });
    expect((await creator.data.interests.get(interestId)).description).toBe('mine');
  }, 120_000);

  /**
   * 013/FR-002. REPLACES "a top-level interest is curated: only an operator may
   * describe it".
   *
   * There is no curated tier. Every interest has a creator, so the rule that
   * survives is the one that was always about accountability: the creator, or
   * an operator. What is asserted here is the OPERATOR half, which the removed
   * test was the only cover for — a stranger's refusal is asserted above.
   */
  it('FR-025 an operator may describe an interest they did not create', async () => {
    const creator = await actor('descPerson');
    const operator = await actor('descOp', { isOperator: true });
    const { interestId } = await publishReadyNamingInterest(creator, freshInterestName('Operated'));

    await operator.data.interests.setDescription(interestId, 'curated');
    expect((await creator.data.interests.get(interestId)).description).toBe('curated');
  }, 120_000);

  it('FR-030 a description is reportable', async () => {
    const creator = await actor('descReportCreator');
    const reporter = await actor('descReporter');
    const operator = await actor('descReportOp', { isOperator: true });
    const { interestId } = await publishReadyNamingInterest(creator, freshInterestName('Reportable'));
    await creator.data.interests.setDescription(interestId, 'something to report');

    await reporter.data.safety.report({
      subjectType: 'interest-description',
      subjectId: interestId,
      reason: 'misinformation',
    });
    const queue = await operator.data.safety.reports({ state: 'open', limit: 50 });
    expect(
      queue.items.some(
        (r) => r.subjectId === interestId && r.subjectType === 'interest-description',
      ),
    ).toBe(true);
  }, 120_000);

  /**
   * SC-009. THE ASSERTION THIS STORY EXISTS FOR.
   *
   * Compares id SETS across the whole listing, not first pages: a version that
   * only checked page one would pass against an ordering that dropped older
   * posts entirely, which is exactly the membership change FR-028 forbids.
   */
  it('SC-009 order=top reorders the set order=new returns, and never changes it (FR-028)', async () => {
    const author = await actor('orderAuthor');
    const reader = await actor('orderReader');
    // The interest is created by the FIRST of the four posts, so the count
    // below is still four.
    const first = await publishReadyNamingInterest(author, freshInterestName('Ordered'), {
      caption: 'ordered post 0',
    });
    const sub = first.interestId;

    const postIds: string[] = [first.postId];
    for (let i = 1; i < 4; i++) {
      postIds.push(await publishReadyImage(author, [sub], { caption: `ordered post ${i}` }));
    }
    // Engagement on the OLDEST, so "top" and "new" genuinely differ. Without
    // this the two orderings coincide and the test proves nothing.
    await reader.data.engagement.react(postIds[0]!);
    await reader.data.engagement.comment(postIds[0]!, 'this one is popular');

    const asNew = await reader.data.interests.posts(sub, { limit: 50 });
    const asTop = await reader.data.interests.posts(sub, { limit: 50, order: 'top' });

    const newIds = asNew.items.map((p: Post) => p.postId);
    const topIds = asTop.items.map((p: Post) => p.postId);

    // MEMBERSHIP identical.
    expect([...topIds].sort()).toEqual([...newIds].sort());
    expect(topIds).toHaveLength(4);

    // ORDER different, and specifically: the engaged post moved up.
    expect(topIds.indexOf(postIds[0]!)).toBeLessThan(newIds.indexOf(postIds[0]!));
  }, 180_000);

  it('SC-009 the two orderings agree even when nothing is engaged at all', async () => {
    const author = await actor('orderQuiet');
    const { interestId: sub } = await publishReadyNamingInterest(
      author,
      freshInterestName('Quiet'),
      { caption: 'quiet 0' },
    );
    for (let i = 1; i < 3; i++) {
      await publishReadyImage(author, [sub], { caption: `quiet ${i}` });
    }

    const asNew = await author.data.interests.posts(sub, { limit: 50 });
    const asTop = await author.data.interests.posts(sub, { limit: 50, order: 'top' });
    // "Top" on a quiet interest must read as "New", not as an arbitrary order.
    expect(asTop.items.map((p: Post) => p.postId)).toEqual(asNew.items.map((p: Post) => p.postId));
  }, 180_000);

  it('FR-029 search within an interest matches captions and stays inside it', async () => {
    const author = await actor('searchAuthor');
    const needle = `needle${Date.now().toString(36)}`;
    const wanted = await publishReadyNamingInterest(author, freshInterestName('Searchable'), {
      caption: `contains the ${needle} exactly`,
    });
    const other = await publishReadyImage(author, [wanted.interestId], { caption: 'unrelated' });

    const hits = await author.data.interests.posts(wanted.interestId, { limit: 50, q: needle });
    expect(hits.items.map((p: Post) => p.postId)).toEqual([wanted.postId]);
    expect(hits.items.map((p: Post) => p.postId)).not.toContain(other);
  }, 180_000);

  /**
   * SURFACE 11. Matching happens AFTER filtering.
   *
   * The naive order - match, then filter - leaks through the COUNT: "3 results"
   * for somebody permitted to see one of them tells them two others exist. The
   * response body never shows it, which is why it needs asserting directly.
   */
  it('SC-005 in-interest search never returns a post the viewer may not see', async () => {
    const author = await actor('searchVisAuthor');
    const stranger = await actor('searchVisStranger');
    const needle = `secret${Date.now().toString(36)}`;
    /**
     * 013. THE PRIVATE POST CREATES THE INTEREST, and that is not incidental.
     *
     * An interest comes into existence as part of publishing into it, and this
     * one's first post is PRIVATE — so the interest exists while its only post
     * is invisible to everybody but its author. The stranger below must see
     * exactly the public one, which is the same assertion it always made and
     * now also covers that case.
     */
    const seed = await publishReadyNamingInterest(author, freshInterestName('Private'), {
      caption: `a private post about ${needle}`,
      visibility: 'private',
    });
    const visible = await publishReadyImage(author, [seed.interestId], {
      caption: `a public post about ${needle}`,
    });

    const asStranger = await stranger.data.interests.posts(seed.interestId, { limit: 50, q: needle });
    expect(asStranger.items.map((p: Post) => p.postId)).toEqual([visible]);

    const asAuthor = await author.data.interests.posts(seed.interestId, { limit: 50, q: needle });
    expect(asAuthor.items).toHaveLength(2);
  }, 180_000);
});
