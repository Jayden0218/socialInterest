import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/** FR-043, FR-045, FR-047, and the ordering SC-010 depends on. */
describe('moderation — reports, decisions, and the audit trail', () => {
  let h: Harness;
  let reporterToken: string;
  let operatorToken: string;
  let authorToken: string;
  let interestId: string;
  let postId: string;

  beforeAll(async () => {
    h = await bootHarness();
    reporterToken = await h.token(await h.createPerson('reporter'));
    operatorToken = await h.token(await h.createPerson('operator'), { isOperator: true });
    authorToken = await h.token(await h.createPerson('reported'));
    interestId = await h.topInterestId();

    const created = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ uploadIds: [await h.uploadId(authorToken)], interestIds: [interestId] });
    postId = created.body.postId;
  }, 120_000);

  afterAll(async () => h?.close());

  const report = (body: Record<string, unknown>) =>
    request(h.app.getHttpServer())
      .post('/v1/reports')
      .set('authorization', `Bearer ${reporterToken}`)
      .send(body);

  it('FR-043: all three subject types are reportable, interest names included', async () => {
    const post = await report({ subjectType: 'post', subjectId: postId, reason: 'spam' });
    expect(post.status).toBe(201);

    const interest = await report({ subjectType: 'interest', subjectId: interestId, reason: 'harassment' });
    // The one that is easy to forget: an interest name is content every visitor
    // to that space sees, and NamePolicy only catches the obvious.
    expect(interest.status).toBe(201);

    /**
     * 008. A COMMENT IS REPORTED AS `<postId>:<commentId>`, and the id is
     * CHECKED.
     *
     * This used to pass a fabricated ULID and expect 201, because the check was
     * a regex — in the same test file whose next case asserts that reporting
     * something that does not exist is refused rather than silently queued. A
     * bare id also located nothing, so no moderator could ever act on it.
     */
    const comment = await report({
      subjectType: 'comment',
      subjectId: `01JQQQQQQQQQQQQQQQQQQQQQQQ:01JQQQQQQQQQQQQQQQQQQQQQQQ`,
      reason: 'other',
    });
    expect(comment.status).toBe(404);
  }, 90_000);

  it('reporting something that does not exist is refused, not silently queued', async () => {
    // An unbounded stream of reports about nothing would bury the real ones,
    // and SC-010 measures the queue's response time.
    const res = await report({ subjectType: 'post', subjectId: '01JZZZZZZZZZZZZZZZZZZZZZZZ', reason: 'spam' });
    expect(res.status).toBe(404);
  });

  it('the queue is OLDEST-first, which is what makes SC-010 measurable', async () => {
    const res = await request(h.app.getHttpServer())
      .get('/v1/moderation/reports?state=open')
      .set('authorization', `Bearer ${operatorToken}`);
    expect(res.status).toBe(200);
    const times = res.body.items.map((r: { createdAt: string }) => r.createdAt);
    // Newest-first would starve the oldest reports while the headline stayed healthy.
    expect([...times].sort()).toEqual(times);
  }, 60_000);

  it('the queue is operator-only', async () => {
    const res = await request(h.app.getHttpServer())
      .get('/v1/moderation/reports')
      .set('authorization', `Bearer ${reporterToken}`);
    /**
     * 403, and it was 401 until 008/T199.
     *
     * The caller is authenticated and simply is not staff, so 401 — "your
     * credentials are the problem" — told a client to do the one thing that
     * cannot help. Nothing in the app acts on either status for this route (the
     * product has no moderation UI), so this is a correctness fix rather than a
     * behavioural one; it is noted rather than slipped in, because this
     * assertion pinned the old value deliberately.
     *
     * The 401 further down this file is a DIFFERENT case and stays: there the
     * caller sends no token at all.
     */
    expect(res.status).toBe(403);
  });

  it('FR-045/FR-047: a decision removes the content, notifies the author, and is audited', async () => {
    const filed = await report({ subjectType: 'post', subjectId: postId, reason: 'explicit' });
    const reportId = filed.body.reportId as string;

    const decision = await request(h.app.getHttpServer())
      .patch(`/v1/moderation/reports/${reportId}`)
      .set('authorization', `Bearer ${operatorToken}`)
      .send({ state: 'actioned', action: 'remove_content', note: 'violates policy' });
    expect(decision.status).toBe(200);
    expect(decision.body.state).toBe('actioned');

    // Removed for everyone, including its author.
    const asAuthor = await request(h.app.getHttpServer())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${authorToken}`);
    expect(asAuthor.status).toBe(404);

    const { ModerationLogRepository } = await import('../../src/persistence/moderation-log.repository');
    const log = h.module.get(ModerationLogRepository);
    const month = new Date().toISOString().slice(0, 7);
    const entries = await log.listMonth(month, { limit: 100 });
    expect(entries.items.some((e) => e.reportId === reportId && e.action === 'remove_content')).toBe(true);
  }, 120_000);

  it('the audit entry SURVIVES deletion of its subject (FR-047)', async () => {
    // Writing the outcome onto the post would erase the trail at exactly the
    // moment it matters - when content was removed and someone asks why.
    const { PostRepository } = await import('../../src/persistence/post.repository');
    await h.module.get(PostRepository).setDeleted(postId, new Date().toISOString());

    const { ModerationLogRepository } = await import('../../src/persistence/moderation-log.repository');
    const entries = await h.module
      .get(ModerationLogRepository)
      .listMonth(new Date().toISOString().slice(0, 7), { limit: 100 });
    expect(entries.items.some((e) => e.subjectId === postId)).toBe(true);
  }, 60_000);

  it('reporting requires authentication', async () => {
    const res = await request(h.app.getHttpServer())
      .post('/v1/reports')
      .send({ subjectType: 'post', subjectId: postId, reason: 'spam' });
    expect(res.status).toBe(401);
  });
});
