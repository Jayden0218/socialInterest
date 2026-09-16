import request from 'supertest';
import { postSchema } from '@sih/shared';
import { bootHarness, type Harness } from './harness';

/**
 * EVERY ROUTE THAT ANSWERS WITH A POST ANSWERS WITH THE CONTRACT'S POST.
 *
 * This exists because `POST /v1/posts` did not, and never had. It returned
 * `PostService.create`'s value straight through — a `PostItem`, the persistence
 * row — so publishing answered with `authorId`, `interestIds` and `updatedAt`
 * and WITHOUT `author`, `interests` or `media`. The document declares all three
 * and makes two of them required, so a client generated from it reads
 * `undefined` and `post.interests.map` throws.
 *
 * It is the SEVENTH instance of this shape in this repository, and the sixth
 * was caught the same way — by something asking for a field the contract
 * promises. The other six:
 *
 *   - the interest space returned VisibilityFilter's candidate rows (004)
 *   - the feed had a second hand-rolled responder, `interestIds` where the
 *     contract says `interests` (004)
 *   - `PostQueryService.listByAuthor` returned candidate rows (run 25)
 *   - `posterUrl` was never sent and the raw media record went out instead,
 *     leaking `originalKey` (004)
 *   - `avatarUrl` emitted as the RAW STORAGE KEY on one of seven profile
 *     projections (008)
 *   - `ApiPage<T>` declared `nextCursor` at the top level (007)
 *
 * TWO ASSERTIONS, AND THE SECOND IS THE ONE THAT WOULD HAVE FAILED. Parsing
 * against `postSchema` catches a MISSING required field; it does not catch an
 * EXTRA one, because zod strips unknown keys rather than refusing them. A
 * persistence row satisfies a permissive parse while still shipping
 * `authorId` to every client, so the internal fields are named explicitly.
 */
describe('a post response is the contract’s Post, on every route that returns one', () => {
  let h: Harness;
  let token: string;
  let postId: string;

  /**
   * Fields that exist on the PERSISTENCE row and on no client. If one of these
   * appears, something is spreading a `PostItem` — which is the defect, whether
   * or not the required fields happen to be present too.
   */
  const INTERNAL = ['authorId', 'interestIds', 'updatedAt', 'type', 'pk', 'sk'];

  beforeAll(async () => {
    h = await bootHarness();
    const userId = await h.createPerson('shapeprobe');
    token = await h.token(userId);
  }, 90_000);

  afterAll(async () => h?.close());

  it('publishing answers with the contract’s Post, not the row that was written', async () => {
    const res = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({
        uploadIds: [await h.uploadId(token)],
        interestIds: [await h.topInterestId()],
        caption: 'the shape of what comes back',
      });
    expect(res.status).toBe(201);
    postId = res.body.postId as string;

    // Required by the document: `author` and `interests`, neither of which the
    // persistence row carries.
    expect(() => postSchema.parse(res.body)).not.toThrow();
    expect(Array.isArray(res.body.interests)).toBe(true);
    expect(res.body.interests.length).toBeGreaterThan(0);
    expect(res.body.author?.handle).toBeTruthy();

    // And nothing internal rode along. zod STRIPS unknown keys, so the parse
    // above is satisfied by a row that still leaks these.
    expect(Object.keys(res.body).filter((k) => INTERNAL.includes(k))).toEqual([]);
  }, 90_000);

  it('post detail answers with the same shape', async () => {
    const res = await request(h.app.getHttpServer())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(() => postSchema.parse(res.body)).not.toThrow();
    expect(Object.keys(res.body).filter((k) => INTERNAL.includes(k))).toEqual([]);
  }, 60_000);
});
