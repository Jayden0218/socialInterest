import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * 004/FR-034 AT A SIZE THAT ASKS THE QUESTION.
 *
 * A display name is in no sort key, so people search filters - and DynamoDB
 * applies `Limit` to the items it EXAMINES, before the filter runs. The old
 * query passed `limit: 200` once, which does not mean "up to 200 matches"; it
 * means "look at 200 people, then filter". Past 200 accounts a match beyond them
 * was invisible, silently, with the endpoint answering 200 OK and an empty list.
 *
 * Nothing caught it for two features. Every people-search test held a handful of
 * accounts, so the bound was never reached, and the requirement was already
 * false for any real deployment. It went red only when 005's journeys pushed the
 * suite's shared table past 200 people - one cap test creates 45 - and it read
 * like a flaky test rather than what it was.
 *
 * So this test is deliberately EXPENSIVE: it creates enough people to cross the
 * bound. A cheaper version would pass against the defect, which is the whole
 * reason the defect survived.
 */
describe('004/FR-034 — a person is findable once the directory is large', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await bootHarness();
  }, 180_000);

  afterAll(async () => {
    await h.close();
  });

  it('finds someone by display name past the single-page examine limit', async () => {
    const searcher = await h.createPerson('scalesearcher');

    /**
     * The target's handle sorts LAST, which is what puts it beyond the first
     * page. `zz` is not decoration: the index is ordered by handle ascending, so
     * a target sorting early would be found by a broken implementation too, and
     * the test would pass while proving nothing.
     */
    const targetId = await h.createPerson('zzztarget');
    const unique = `Renamed${Date.now().toString(36)}`;

    // Enough people to push past EXAMINE_PAGE (200), all sorting BEFORE the
    // target so a single-page query cannot reach it.
    const filler: Promise<string>[] = [];
    for (let i = 0; i < 260; i++) filler.push(h.createPerson(`aafiller${i}`));
    await Promise.all(filler);

    const token = await h.token(targetId);
    const renamed = await request(h.app.getHttpServer())
      .patch('/v1/me')
      .set('authorization', `Bearer ${token}`)
      .send({ displayName: unique });
    expect(renamed.status).toBe(200);

    const found = await request(h.app.getHttpServer())
      .get(`/v1/people?q=${encodeURIComponent(unique)}&limit=25`)
      .set('authorization', `Bearer ${await h.token(searcher)}`);

    expect(found.status).toBe(200);
    // THE ASSERTION THAT WAS FAILING. Before the fix this array is empty: the
    // query examined the first 200 handles, none of which was the target.
    expect(found.body.items.map((p: { handle: string }) => p.handle)).toContain(
      (await request(h.app.getHttpServer()).get('/v1/me').set('authorization', `Bearer ${token}`)).body
        .handle,
    );
  }, 300_000);
});
