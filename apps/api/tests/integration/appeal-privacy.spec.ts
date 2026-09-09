import request from 'supertest';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';
import { bootHarness, type Harness } from './harness';

/**
 * 008/T191, US14 — FR-048, SC-015, Constitution Principle III.
 *
 * AN APPEAL IS READABLE BY ITS AUTHOR AND MODERATORS. NOBODY ELSE.
 *
 * Driven the way a hostile client would: another person's appeal id, sent
 * directly to the endpoint, with a valid token of their own. Principle III says
 * a privacy guarantee is tested through the path a modified client takes, not
 * the one the app happens to offer — and the app offers no way to type somebody
 * else's appeal id, which is exactly why this file exists.
 *
 * The refusal is **404, not 403**, and that is the disclosure rule the
 * visibility contract sets for blocks applied to moderation: a 403 confirms the
 * appeal exists, and therefore that a named person had content removed. The
 * error must not be the leak.
 */
describe('008/US14 an appeal is private to its author and moderators', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

  /** A post published, reported, and removed — so its author has a notice. */
  const removeAPost = async (authorToken: string, operatorToken: string, reporterToken: string) => {
    const created = await request(server())
      .post('/v1/posts')
      .set('authorization', `Bearer ${authorToken}`)
      .send({
        uploadIds: [await h.uploadId(authorToken)],
        interestIds: [await h.topInterestId()],
        caption: 'something a moderator will remove',
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
      .send({ subjectType: 'post', subjectId: postId, reason: 'explicit' });
    expect({ step: 'report', status: filed.status }).toEqual({ step: 'report', status: 201 });

    const decided = await request(server())
      .patch(`/v1/moderation/reports/${filed.body.reportId}`)
      .set('authorization', `Bearer ${operatorToken}`)
      .send({ state: 'actioned', action: 'remove_content', note: 'internal: policy 4.2' });
    expect({ step: 'decide', status: decided.status }).toEqual({ step: 'decide', status: 200 });
    return postId;
  };

  it('FR-046 the author is told WHAT and WHY, and never the moderator note', async () => {
    const author = await h.createPerson('noticeAuthor');
    const authorToken = await h.token(author);
    const operatorToken = await h.token(await h.createPerson('noticeOperator'), { isOperator: true });
    const reporterToken = await h.token(await h.createPerson('noticeReporter'));

    const postId = await removeAPost(authorToken, operatorToken, reporterToken);

    const notices = await request(server())
      .get('/v1/me/moderation-notices')
      .set('authorization', `Bearer ${authorToken}`);
    expect(notices.status).toBe(200);
    const notice = notices.body.items.find((n: { subjectId: string }) => n.subjectId === postId);
    expect({
      found: notice !== undefined,
      subjectType: notice?.subjectType,
      action: notice?.action,
      // FR-046's "why": the reported CATEGORY.
      reason: notice?.reason,
    }).toEqual({ found: true, subjectType: 'post', action: 'remove_content', reason: 'explicit' });

    /**
     * AND NOT THE MODERATOR'S NOTE, NOR WHO DECIDED.
     *
     * Asserted on the whole serialised response rather than on absent keys: the
     * note could reach the author through any field, and a key-by-key check
     * passes over the one nobody thought of. Naming the moderator would invite
     * the retaliation the queue exists to absorb.
     */
    const serialised = JSON.stringify(notices.body);
    expect({
      leaksNote: serialised.includes('policy 4.2'),
      leaksModerator: serialised.includes('moderatorId'),
    }).toEqual({ leaksNote: false, leaksModerator: false });
  }, 120_000);

  it('FR-048 another signed-in person cannot read the appeal, and the error does not confirm it exists', async () => {
    const authorToken = await h.token(await h.createPerson('appealAuthor'));
    const operatorToken = await h.token(await h.createPerson('appealOperator'), { isOperator: true });
    const reporterToken = await h.token(await h.createPerson('appealReporter'));
    const stranger = await h.token(await h.createPerson('appealStranger'));

    await removeAPost(authorToken, operatorToken, reporterToken);

    const notices = await request(server())
      .get('/v1/me/moderation-notices')
      .set('authorization', `Bearer ${authorToken}`);
    const actionId = notices.body.items[0].actionId as string;

    const appealed = await request(server())
      .post('/v1/appeals')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ actionId, body: 'This was a photograph of a sunset.' });
    expect({ step: 'appeal', status: appealed.status }).toEqual({ step: 'appeal', status: 201 });
    const appealId = appealed.body.appealId as string;

    // The author reads their own.
    const mine = await request(server())
      .get(`/v1/appeals/${appealId}`)
      .set('authorization', `Bearer ${authorToken}`);
    expect({ status: mine.status, appealId: mine.body.appealId }).toEqual({ status: 200, appealId });

    /**
     * THE HOSTILE PATH. A real token, a real appeal id, sent directly.
     *
     * 404, and the SAME 404 an entirely made-up id gets — asserted together,
     * because "it refused" is not the guarantee. The guarantee is that the two
     * answers are indistinguishable, so an id cannot be used as an oracle for
     * whether somebody's content was removed.
     */
    const asStranger = await request(server())
      .get(`/v1/appeals/${appealId}`)
      .set('authorization', `Bearer ${stranger}`);
    const asStrangerNonsense = await request(server())
      .get('/v1/appeals/01JZZZZZZZZZZZZZZZZZZZZZZZ')
      .set('authorization', `Bearer ${stranger}`);
    expect({
      real: asStranger.status,
      invented: asStrangerNonsense.status,
      sameBody: JSON.stringify(asStranger.body.title) === JSON.stringify(asStrangerNonsense.body.title),
    }).toEqual({ real: 404, invented: 404, sameBody: true });

    // Nor is it in a stranger's own list, which is the other way it could leak.
    const theirList = await request(server())
      .get('/v1/me/appeals')
      .set('authorization', `Bearer ${stranger}`);
    expect(theirList.body.items).toEqual([]);

    // A MODERATOR reads it — the other half of FR-048, and a guarantee that
    // hid it from moderators too would make the appeal unanswerable.
    const asOperator = await request(server())
      .get(`/v1/appeals/${appealId}`)
      .set('authorization', `Bearer ${operatorToken}`);
    expect({ status: asOperator.status, appealId: asOperator.body.appealId }).toEqual({
      status: 200,
      appealId,
    });
  }, 120_000);

  it('FR-047 a decision cannot be appealed twice', async () => {
    const authorToken = await h.token(await h.createPerson('twiceAuthor'));
    const operatorToken = await h.token(await h.createPerson('twiceOperator'), { isOperator: true });
    const reporterToken = await h.token(await h.createPerson('twiceReporter'));
    await removeAPost(authorToken, operatorToken, reporterToken);

    const notices = await request(server())
      .get('/v1/me/moderation-notices')
      .set('authorization', `Bearer ${authorToken}`);
    const actionId = notices.body.items[0].actionId as string;

    const first = await request(server())
      .post('/v1/appeals')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ actionId, body: 'first' });
    const second = await request(server())
      .post('/v1/appeals')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ actionId, body: 'second' });
    // The same disagreement, not a second one. Letting it through would let one
    // person fill the queue SC-010's 24-hour target is measured against.
    expect({ first: first.status, second: second.status }).toEqual({ first: 201, second: 409 });
  }, 120_000);

  it('FR-047 an appeal cannot be filed against somebody else’s notice', async () => {
    const authorToken = await h.token(await h.createPerson('otherNoticeAuthor'));
    const operatorToken = await h.token(await h.createPerson('otherNoticeOperator'), { isOperator: true });
    const reporterToken = await h.token(await h.createPerson('otherNoticeReporter'));
    const stranger = await h.token(await h.createPerson('otherNoticeStranger'));
    await removeAPost(authorToken, operatorToken, reporterToken);

    const notices = await request(server())
      .get('/v1/me/moderation-notices')
      .set('authorization', `Bearer ${authorToken}`);
    const actionId = notices.body.items[0].actionId as string;

    /**
     * The authorisation model in one assertion: an appeal is filed against a
     * NOTICE, and a notice lives in its recipient's own partition — so this is
     * refused by a read that finds nothing rather than by an ownership check
     * somebody could forget for one of four subject kinds.
     */
    const stolen = await request(server())
      .post('/v1/appeals')
      .set('authorization', `Bearer ${stranger}`)
      .send({ actionId, body: 'not mine to appeal' });
    expect(stolen.status).toBe(404);
  }, 120_000);
});
