import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { InterestService } from '../../src/modules/interests/interest.service';
import { InMemoryCatalogueCache } from '../../src/modules/interests/catalogue.cache';
import { PostInterestIndexRepository } from '../../src/persistence/post-interest-index.repository';
import { bootHarness, type Harness } from './harness';

/**
 * 013/T035, T036 — FR-022, FR-023. AN INTEREST NO POST USES DOES NOT LINGER.
 *
 * The interesting half is T036: housekeeping must NOT touch an interest that
 * has posts. A retire-everything job passes T035 and destroys the product, so
 * the negative case is the one worth having.
 */
let h: Harness;
let interests: InterestService;
let index: PostInterestIndexRepository;
let token: string;

const publishNaming = async (name: string) => {
  const res = await request(h.app.getHttpServer())
    .post('/v1/posts')
    .set('authorization', `Bearer ${token}`)
    .send({ uploadIds: [await h.uploadId(token)], interestNames: [name] });
  expect(res.status).toBe(201);
  return {
    postId: res.body.postId as string,
    interestId: (res.body.interests as { interestId: string }[])[0]!.interestId,
  };
};

beforeAll(async () => {
  h = await bootHarness();
  interests = h.module.get(InterestService);
  index = h.module.get(PostInterestIndexRepository);
  token = await h.token(await h.createPerson('keeper'));
}, 120_000);

afterAll(async () => h?.close());

describe('013/FR-022, FR-023 — housekeeping', () => {
  it('T036: an interest that HAS posts is left alone', async () => {
    const { interestId } = await publishNaming(`Kept ${randomUUID().slice(0, 8)}`);

    expect(await interests.retireIfEmpty(interestId)).toBe(false);
    expect(h.module.get(InMemoryCatalogueCache).byId(interestId)?.state).toBe('active');
  }, 90_000);

  it('T035: an interest whose last post is gone stops being browsable', async () => {
    const { postId, interestId } = await publishNaming(`Abandoned ${randomUUID().slice(0, 8)}`);

    // Remove the index row the interest is held up by. This is what a deletion
    // or a moderator removal leaves behind.
    const page = await index.listByInterest(interestId, { limit: 10 });
    for (const item of page.items) await index.removeForPost(interestId, item.createdAt, postId);

    expect(await interests.retireIfEmpty(interestId)).toBe(true);
    expect(h.module.get(InMemoryCatalogueCache).byId(interestId)?.state).toBe('retired');
  }, 90_000);

  /**
   * 013/T037. THE DECISION: "HAS POSTS" MEANS ROWS EXIST, NOT THAT ANYONE CAN
   * SEE THEM — AND THE BOUNDARY IS NOT CONSULTED.
   *
   * A post turned private keeps its `postInterestIndex` row; only the
   * denormalised `visibility` changes. So an interest whose every post is
   * private is NOT retired, and that is the right answer twice over:
   *
   *  - the author can still see their own posts, and retiring the interest
   *    would take a live space away from under them;
   *  - asking the boundary instead would make retirement depend on WHO is
   *    asking. One person blocking the only author would empty the interest
   *    from their point of view, and a job acting on that would retire it for
   *    everybody — which is a second visibility decision, and Principle II
   *    permits exactly one.
   *
   * A moderator REMOVAL is different in kind and needs no special case: it
   * removes the index rows, so the interest becomes genuinely empty and the
   * ordinary rule retires it.
   */
  it('T037: an interest whose posts are all private is NOT retired', async () => {
    const name = `Private ${randomUUID().slice(0, 8)}`;
    const { postId, interestId } = await publishNaming(name);

    const rows = await index.listByInterest(interestId, { limit: 10 });
    expect(rows.items).toHaveLength(1);

    // What a visibility change does, through the product's own path: the ROW
    // stays and only the denormalised field moves.
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const { PostTransaction } = await import('../../src/modules/posts/post.transaction');
    const post = await h.module.get(PostRepository).findById(postId);
    await h.module.get(PostTransaction).updateVisibility({
      post: post!,
      expandedInterestIds: [interestId],
      visibility: 'private',
    });

    expect((await index.listByInterest(interestId, { limit: 10 })).items).toHaveLength(1);

    expect(await interests.retireIfEmpty(interestId)).toBe(false);
    expect(h.module.get(InMemoryCatalogueCache).byId(interestId)?.state).toBe('active');
  }, 90_000);

  it('a retired interest is not offered by search or by the duplicate gate', async () => {
    const name = `Vanished ${randomUUID().slice(0, 8)}`;
    const { postId, interestId } = await publishNaming(name);
    const page = await index.listByInterest(interestId, { limit: 10 });
    for (const item of page.items) await index.removeForPost(interestId, item.createdAt, postId);
    await interests.retireIfEmpty(interestId);

    // `findExact` and `findSimilar` see live interests only, which is what makes
    // a retired name reusable rather than permanently burnt.
    const cache = h.module.get(InMemoryCatalogueCache);
    expect(cache.findExactByName(name)).toBeNull();
    expect(cache.findSimilar(name).map((m) => m.interest.interestId)).not.toContain(interestId);
  }, 90_000);
});
