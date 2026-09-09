import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';
import { SignalRepository } from '../../src/persistence/signal.repository';

/**
 * 008/T088, T090 — US6. POST TEXT SEARCH.
 *
 * Three claims, and the second is the one the 008 analysis pass added after the
 * first version of this feature's design forgot it entirely:
 *
 *  - SC-009: findable by a distinctive word, UNFINDABLE by somebody who may not
 *    see it. The index selects; the boundary decides.
 *  - **The index follows the caption.** Captions are editable, so without
 *    re-indexing a post stays findable by a word it no longer contains — an
 *    index wrong in a way nothing else in the suite would notice.
 *  - FR-021: a search moves no ranking weight.
 */
describe('008/US6 post search', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

  /**
   * A PER-RUN SUFFIX ON EVERY DISTINCTIVE WORD.
   *
   * The local table is shared across runs — CLAUDE.md records two "regressions"
   * that were a table grown to 3,875 people — and this suite's whole method is
   * to search for a word only one post contains. Without a nonce the second run
   * of this file finds the FIRST run's post as well, which is not a defect and
   * looks exactly like one.
   *
   * Lowercase and letters-only, because the tokeniser folds case and splits on
   * anything else: a nonce it would split in half would not be one word.
   */
  const RUN = Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6) || 'zzzzzz';
  const word = (stem: string): string => `${stem}${RUN}`;

  const publishReady = async (
    token: string,
    caption: string,
    visibility: 'public' | 'followers' = 'public',
  ): Promise<string> => {
    const created = await request(server())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({
        uploadIds: [await h.uploadId(token)],
        interestIds: [await h.topInterestId()],
        caption,
        visibility,
      });
    expect({ step: 'publish', status: created.status }).toEqual({ step: 'publish', status: 201 });
    const postId = created.body.postId as string;
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);
    return postId;
  };

  const search = async (token: string, q: string): Promise<request.Response> =>
    request(server())
      .get(`/v1/search/posts?q=${encodeURIComponent(q)}`)
      .set('authorization', `Bearer ${token}`);

  const ids = (res: request.Response): string[] =>
    res.body.items.map((p: { postId: string }) => p.postId);

  it('FR-020 finds a post by a distinctive word in its caption', async () => {
    const author = await h.createPerson('searchAuthor');
    const token = await h.token(author);
    const wanted = await publishReady(token, `a quiet morning at the ${word('belvedere')} overlook`);
    await publishReady(token, 'something else entirely');

    const res = await search(token, word('belvedere'));
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([wanted]);
  }, 120_000);

  it('INTERSECTS terms — two words mean both, not either', async () => {
    const author = await h.createPerson('searchIntersect');
    const token = await h.token(author);
    const both = await publishReady(token, `${word('granite')} slab ${word('traverse')}`);
    const onlyOne = await publishReady(token, `${word('granite')} countertop`);

    const res = await search(token, `${word('granite')} ${word('traverse')}`);
    expect({ has: ids(res).includes(both), hasOther: ids(res).includes(onlyOne) })
      .toEqual({ has: true, hasOther: false });
  }, 120_000);

  it('SC-009 a restricted post is findable by its author and by NOBODY else', async () => {
    const author = await h.createPerson('searchPrivate');
    const authorToken = await h.token(author);
    const stranger = await h.createPerson('searchStranger');
    const strangerToken = await h.token(stranger);

    const postId = await publishReady(authorToken, `a secret ${word('ptarmigan')} sighting`, 'followers');

    expect(ids(await search(authorToken, word('ptarmigan')))).toEqual([postId]);

    /**
     * THE HALF THE INDEX MUST NOT DELIVER. The term row exists and carries the
     * post; the BOUNDARY removes it. And the response must not leak the caption
     * some other way, which is why the whole body is checked rather than the
     * items array.
     */
    const denied = await search(strangerToken, word('ptarmigan'));
    expect(ids(denied)).toEqual([]);
    expect(JSON.stringify(denied.body)).not.toContain(`${word('ptarmigan')} sighting`);
  }, 120_000);

  it('the index FOLLOWS a caption edit, in both directions', async () => {
    const author = await h.createPerson('searchEdit');
    const token = await h.token(author);
    const postId = await publishReady(token, `a post about ${word('kingfishers')}`);

    expect(ids(await search(token, word('kingfishers')))).toEqual([postId]);

    const edited = await request(server())
      .patch(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${token}`)
      .send({ caption: `a post about ${word('cormorants')}` });
    expect({ step: 'edit', status: edited.status }).toEqual({ step: 'edit', status: 200 });

    // Both directions. Only checking the new word would pass for an index that
    // appends and never removes, which is the likelier bug.
    expect({
      byOldWord: ids(await search(token, word('kingfishers'))),
      byNewWord: ids(await search(token, word('cormorants'))),
    }).toEqual({ byOldWord: [], byNewWord: [postId] });
  }, 120_000);

  it('a VISIBILITY change fans out to the term rows', async () => {
    const author = await h.createPerson('searchVisFlip');
    const authorToken = await h.token(author);
    const stranger = await h.createPerson('searchVisStranger');
    const strangerToken = await h.token(stranger);

    const postId = await publishReady(authorToken, `a public ${word('wheatear')}`, 'public');
    expect(ids(await search(strangerToken, word('wheatear')))).toEqual([postId]);

    await request(server())
      .patch(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${authorToken}`)
      .send({ visibility: 'followers' });

    // 001/FR-017: the flip lands on every surface immediately, search included.
    expect(ids(await search(strangerToken, word('wheatear')))).toEqual([]);
  }, 120_000);

  it('a DELETED post leaves the index', async () => {
    const author = await h.createPerson('searchDelete');
    const token = await h.token(author);
    const postId = await publishReady(token, `a transient ${word('nuthatch')}`);
    expect(ids(await search(token, word('nuthatch')))).toEqual([postId]);

    await request(server()).delete(`/v1/posts/${postId}`).set('authorization', `Bearer ${token}`);
    expect(ids(await search(token, word('nuthatch')))).toEqual([]);
  }, 120_000);

  it('FR-022 a miss offers interests and people, in the SAME response', async () => {
    const person = await h.createPerson('searchFallback');
    const token = await h.token(person);
    await h.createPerson('searchFallbackOther');

    const res = await search(token, 'searchFallbackOther');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    // In the same response rather than behind a second request, so a client can
    // render the fallback without a round trip.
    expect(Array.isArray(res.body.fallback?.people)).toBe(true);
    expect(Array.isArray(res.body.fallback?.interests)).toBe(true);
  }, 120_000);

  it('FR-021 searching moves NO ranking weight', async () => {
    const person = await h.createPerson('searchSignals');
    const token = await h.token(person);
    await publishReady(token, `a caption full of ${word('distinctive')} ${word('vocabulary')}`);

    const profiles = h.module.get(SignalRepository);
    const before = JSON.stringify((await profiles.profile(person)) ?? null);
    await search(token, word('distinctive'));
    await search(token, word('vocabulary'));
    const after = JSON.stringify((await profiles.profile(person)) ?? null);
    expect({ before, after }).toEqual({ before, after: before });
  }, 120_000);
});
