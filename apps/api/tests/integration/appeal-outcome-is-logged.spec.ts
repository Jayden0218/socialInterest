import request from 'supertest';
import { ModerationLogRepository } from '../../src/persistence/moderation-log.repository';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';
import { bootHarness, type Harness } from './harness';

/**
 * 008/T192, US14 — FR-047, Constitution Principle IV.
 *
 * THE OUTCOME IS APPENDED TO THE MODERATION LOG, AND SURVIVES THE SUBJECT.
 *
 * The log is append-only and stored apart from the content it concerns, which is
 * the whole reason it exists: the moment somebody asks "why was this removed"
 * is the moment the content is gone. A decision recorded ON the post would
 * evaporate exactly when it is needed.
 *
 * So this suite decides an appeal, deletes the subject, and reads the log again.
 * It also checks the half a decision endpoint is most likely to ship without:
 * the AUTHOR is told the outcome. An appeal answered into a log nobody outside
 * the moderation team can read is a refusal with extra steps.
 */
describe('008/US14 an appeal outcome is logged and delivered', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

  it('FR-047 the outcome reaches the log, the author, and outlives the post', async () => {
    const authorToken = await h.token(await h.createPerson('appealLogAuthor'));
    const operatorToken = await h.token(await h.createPerson('appealLogOperator'), { isOperator: true });
    const reporterToken = await h.token(await h.createPerson('appealLogReporter'));

    const created = await request(server())
      .post('/v1/posts')
      .set('authorization', `Bearer ${authorToken}`)
      .send({
        uploadIds: [await h.uploadId(authorToken)],
        interestIds: [await h.topInterestId()],
        caption: 'a post that will be removed and appealed',
        visibility: 'public',
      });
    expect({ step: 'publish', status: created.status }).toEqual({ step: 'publish', status: 201 });
    const postId = created.body.postId as string;
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);

    const filed = await request(server())
      .post('/v1/reports')
      .set('authorization', `Bearer ${reporterToken}`)
      .send({ subjectType: 'post', subjectId: postId, reason: 'spam' });
    expect({ step: 'report', status: filed.status }).toEqual({ step: 'report', status: 201 });
    const decided = await request(server())
      .patch(`/v1/moderation/reports/${filed.body.reportId}`)
      .set('authorization', `Bearer ${operatorToken}`)
      .send({ state: 'actioned', action: 'remove_content' });
    expect({ step: 'remove', status: decided.status }).toEqual({ step: 'remove', status: 200 });

    const notices = await request(server())
      .get('/v1/me/moderation-notices')
      .set('authorization', `Bearer ${authorToken}`);
    const notice = notices.body.items.find((n: { subjectId: string }) => n.subjectId === postId);
    expect(notice).toBeDefined();

    const appealed = await request(server())
      .post('/v1/appeals')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ actionId: notice.actionId, body: 'It was a photograph of my dinner.' });
    expect({ step: 'appeal', status: appealed.status }).toEqual({ step: 'appeal', status: 201 });
    const appealId = appealed.body.appealId as string;

    // The queue. Oldest first, which is what makes a 24-hour target meaningful
    // rather than a number that stays healthy while the oldest appeal starves.
    const queue = await request(server())
      .get('/v1/moderation/appeals')
      .set('authorization', `Bearer ${operatorToken}`);
    expect(queue.status).toBe(200);
    expect(queue.body.items.map((a: { appealId: string }) => a.appealId)).toContain(appealId);

    const outcome = await request(server())
      .patch(`/v1/moderation/appeals/${appealId}`)
      .set('authorization', `Bearer ${operatorToken}`)
      .send({ state: 'upheld', note: 'internal: reviewer agrees' });
    expect({ status: outcome.status, state: outcome.body.state }).toEqual({
      status: 200,
      state: 'upheld',
    });

    // FR-047's second half: the AUTHOR is told, in their own list.
    const mine = await request(server())
      .get('/v1/me/appeals')
      .set('authorization', `Bearer ${authorToken}`);
    const returned = mine.body.items.find((a: { appealId: string }) => a.appealId === appealId);
    expect({ found: returned !== undefined, state: returned?.state }).toEqual({
      found: true,
      state: 'upheld',
    });

    // And it is not decidable twice — a second decision would silently overwrite
    // the first in the log's narrative while both entries stayed.
    const again = await request(server())
      .patch(`/v1/moderation/appeals/${appealId}`)
      .set('authorization', `Bearer ${operatorToken}`)
      .send({ state: 'rejected' });
    expect(again.status).toBe(409);

    /**
     * PRINCIPLE IV: the record outlives the subject.
     *
     * The post is deleted AFTER the decision, and the log entry is read back
     * afterwards. This is the assertion that fails if somebody ever "simplifies"
     * the audit trail onto the post — which would look correct in every test
     * that does not delete anything.
     */
    const deleted = await request(server())
      .delete(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${authorToken}`);
    expect([204, 404]).toContain(deleted.status);

    const log = h.module.get(ModerationLogRepository);
    const month = new Date().toISOString().slice(0, 7);
    const entries = await log.listMonth(month, { limit: 500 });
    const forThisPost = entries.items.filter((e) => e.subjectId === postId);
    expect({
      removal: forThisPost.some((e) => e.action === 'remove_content'),
      outcome: forThisPost.some((e) => e.action === 'appeal_upheld'),
    }).toEqual({ removal: true, outcome: true });
  }, 180_000);
});
