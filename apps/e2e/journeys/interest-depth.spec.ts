import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';
import type { Post } from '@sih/shared';

/**
 * 004/US3. An interest page worth opening.
 *
 * The case that matters is SC-009: an alternative ordering may change the
 * ORDER and must never change the MEMBERSHIP. A "Top" tab that quietly ran its
 * own query would be a second visibility decision, which Constitution II
 * forbids - and it would look completely fine on screen.
 */
describe('004/US3 - an interest page is worth opening', () => {
  it('FR-025 a sub-interest creator can edit its description, and it is read back', async () => {
    const creator = await actor('descCreator');
    const top = (await creator.data.interests.listTop({ limit: 1 })).items[0]!;
    const sub = await creator.data.interests.create({
      name: `Described ${Date.now().toString().slice(-6)}`,
      parentId: top.interestId,
    });

    await creator.data.interests.setDescription(sub.interestId, 'What this sub-interest is for.');
    const after = await creator.data.interests.get(sub.interestId);
    expect(after.description).toBe('What this sub-interest is for.');
  }, 120_000);

  it('FR-025 somebody else cannot rewrite a description they did not create', async () => {
    const creator = await actor('descOwner');
    const stranger = await actor('descStranger');
    const top = (await creator.data.interests.listTop({ limit: 1 })).items[0]!;
    const sub = await creator.data.interests.create({
      name: `Guarded ${Date.now().toString().slice(-6)}`,
      parentId: top.interestId,
    });
    await creator.data.interests.setDescription(sub.interestId, 'mine');

    await expect(
      stranger.data.interests.setDescription(sub.interestId, 'not yours'),
    ).rejects.toMatchObject({ status: 403 });
    expect((await creator.data.interests.get(sub.interestId)).description).toBe('mine');
  }, 120_000);

  it('FR-025 a top-level interest is curated: only an operator may describe it', async () => {
    const person = await actor('descPerson');
    const operator = await actor('descOp', { isOperator: true });
    const top = (await person.data.interests.listTop({ limit: 1 })).items[0]!;

    await expect(
      person.data.interests.setDescription(top.interestId, 'anyone can write this'),
    ).rejects.toMatchObject({ status: 403 });

    await operator.data.interests.setDescription(top.interestId, 'curated');
    expect((await person.data.interests.get(top.interestId)).description).toBe('curated');
  }, 120_000);

  it('FR-030 a description is reportable', async () => {
    const creator = await actor('descReportCreator');
    const reporter = await actor('descReporter');
    const operator = await actor('descReportOp', { isOperator: true });
    const top = (await creator.data.interests.listTop({ limit: 1 })).items[0]!;
    const sub = await creator.data.interests.create({
      name: `Reportable ${Date.now().toString().slice(-6)}`,
      parentId: top.interestId,
    });
    await creator.data.interests.setDescription(sub.interestId, 'something to report');

    await reporter.data.safety.report({
      subjectType: 'interest-description',
      subjectId: sub.interestId,
      reason: 'misinformation',
    });
    const queue = await operator.data.safety.reports({ state: 'open', limit: 50 });
    expect(
      queue.items.some(
        (r) => r.subjectId === sub.interestId && r.subjectType === 'interest-description',
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
    const top = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const sub = await author.data.interests.create({
      name: `Ordered ${Date.now().toString().slice(-6)}`,
      parentId: top.interestId,
    });

    const postIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      postIds.push(
        await publishReadyImage(author, [sub.interestId], { caption: `ordered post ${i}` }),
      );
    }
    // Engagement on the OLDEST, so "top" and "new" genuinely differ. Without
    // this the two orderings coincide and the test proves nothing.
    await reader.data.engagement.react(postIds[0]!);
    await reader.data.engagement.comment(postIds[0]!, 'this one is popular');

    const asNew = await reader.data.interests.posts(sub.interestId, { limit: 50 });
    const asTop = await reader.data.interests.posts(sub.interestId, { limit: 50, order: 'top' });

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
    const top = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const sub = await author.data.interests.create({
      name: `Quiet ${Date.now().toString().slice(-6)}`,
      parentId: top.interestId,
    });
    for (let i = 0; i < 3; i++) {
      await publishReadyImage(author, [sub.interestId], { caption: `quiet ${i}` });
    }

    const asNew = await author.data.interests.posts(sub.interestId, { limit: 50 });
    const asTop = await author.data.interests.posts(sub.interestId, { limit: 50, order: 'top' });
    // "Top" on a quiet interest must read as "New", not as an arbitrary order.
    expect(asTop.items.map((p: Post) => p.postId)).toEqual(asNew.items.map((p: Post) => p.postId));
  }, 180_000);

  it('FR-029 search within an interest matches captions and stays inside it', async () => {
    const author = await actor('searchAuthor');
    const top = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const sub = await author.data.interests.create({
      name: `Searchable ${Date.now().toString().slice(-6)}`,
      parentId: top.interestId,
    });
    const needle = `needle${Date.now().toString(36)}`;
    const wanted = await publishReadyImage(author, [sub.interestId], {
      caption: `contains the ${needle} exactly`,
    });
    const other = await publishReadyImage(author, [sub.interestId], { caption: 'unrelated' });

    const hits = await author.data.interests.posts(sub.interestId, { limit: 50, q: needle });
    expect(hits.items.map((p: Post) => p.postId)).toEqual([wanted]);
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
    const top = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const sub = await author.data.interests.create({
      name: `Private ${Date.now().toString().slice(-6)}`,
      parentId: top.interestId,
    });
    const needle = `secret${Date.now().toString(36)}`;
    await publishReadyImage(author, [sub.interestId], {
      caption: `a private post about ${needle}`,
      visibility: 'private',
    });
    const visible = await publishReadyImage(author, [sub.interestId], {
      caption: `a public post about ${needle}`,
    });

    const asStranger = await stranger.data.interests.posts(sub.interestId, { limit: 50, q: needle });
    expect(asStranger.items.map((p: Post) => p.postId)).toEqual([visible]);

    const asAuthor = await author.data.interests.posts(sub.interestId, { limit: 50, q: needle });
    expect(asAuthor.items).toHaveLength(2);
  }, 180_000);
});
