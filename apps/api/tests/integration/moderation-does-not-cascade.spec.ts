import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';

/**
 * 008/T110, US7 — FR-026. REMOVING A COMMENT MUST NOT TAKE ITS REPLIES WITH IT.
 *
 * The rule is 005/FR-024's, in a third place: a removed conversation name blanks
 * the name and leaves the group; a removed message withholds its body and leaves
 * the thread. Destroying a sub-thread punishes everyone who answered for one
 * person's text, and — worse — makes a removal indistinguishable from a bug to
 * the people whose replies vanished.
 *
 * THE FIRST ASSERTION HERE IS NOT ABOUT CASCADING AT ALL. Writing this test
 * found that removing a reported comment **did nothing to the comment**:
 * `report.service.ts` has accepted `subjectType: 'comment'` since 001, the
 * moderator's decision transitioned the report and wrote the audit log, and the
 * comment stayed on the page. Reporting existed and removal did not — the same
 * declared-half-with-no-other-half pattern 008 exists to end, on a Constitution
 * IV release gate.
 */
describe('008/US7 moderating a comment does not cascade', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

  it('FR-026 the parent reads as removed and every reply survives', async () => {
    const author = await h.createPerson('modAuthor');
    const replier = await h.createPerson('modReplier');
    const operator = await h.createPerson('modOperator');
    const authorToken = await h.token(author);
    const replierToken = await h.token(replier);
    const operatorToken = await h.token(operator, { isOperator: true });

    const created = await request(server())
      .post('/v1/posts')
      .set('authorization', `Bearer ${authorToken}`)
      .send({
        uploadIds: [await h.uploadId(authorToken)],
        interestIds: [await h.topInterestId()],
        caption: 'a post with a moderated comment',
        visibility: 'public',
      });
    expect(created.status).toBe(201);
    const postId = created.body.postId as string;
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);

    const parent = await request(server())
      .post(`/v1/posts/${postId}/comments`)
      .set('authorization', `Bearer ${authorToken}`)
      .send({ body: 'the offending remark' });
    expect(parent.status).toBe(201);
    const parentId = parent.body.commentId as string;

    const reply = await request(server())
      .post(`/v1/posts/${postId}/comments`)
      .set('authorization', `Bearer ${replierToken}`)
      .send({ body: 'an innocent answer', parentCommentId: parentId });
    expect(reply.status).toBe(201);
    const replyId = reply.body.commentId as string;

    const reported = await request(server())
      .post('/v1/reports')
      .set('authorization', `Bearer ${replierToken}`)
      // `<postId>:<commentId>` — a comment id alone does not locate the row.
      .send({ subjectType: 'comment', subjectId: `${postId}:${parentId}`, reason: 'harassment' });
    expect(reported.status).toBe(201);

    const decided = await request(server())
      .patch(`/v1/moderation/reports/${reported.body.reportId}`)
      .set('authorization', `Bearer ${operatorToken}`)
      .send({ state: 'actioned', action: 'remove_content' });
    expect(decided.status).toBe(200);

    const after = await request(server())
      .get(`/v1/posts/${postId}/comments`)
      .set('authorization', `Bearer ${replierToken}`);
    expect(after.status).toBe(200);
    const byId = new Map(
      after.body.items.map((c: { commentId: string }) => [c.commentId, c]),
    ) as Map<string, { body: string | null; moderationState?: string; parentCommentId: string | null }>;

    /**
     * BOTH HALVES. The parent is STILL LISTED — a removal that deleted the row
     * would take the thread's shape with it — and reads as removed rather than
     * carrying its text. The reply is untouched and still points at it.
     */
    expect({
      parentPresent: byId.has(parentId),
      parentState: byId.get(parentId)?.moderationState ?? null,
      parentBody: byId.get(parentId)?.body ?? null,
      replyBody: byId.get(replyId)?.body ?? null,
      replyParent: byId.get(replyId)?.parentCommentId ?? null,
    }).toEqual({
      parentPresent: true,
      parentState: 'removed',
      parentBody: null,
      replyBody: 'an innocent answer',
      replyParent: parentId,
    });
  }, 180_000);
});
