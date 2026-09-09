import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

/**
 * 008/T091, US6 — POST SEARCH, OVER REAL HTTP, THROUGH THE APP'S OWN DATA LAYER.
 *
 * The integration suite covers the rules against the service. This exists for
 * what that cannot claim: that the APP can read the result — including the
 * `fallback` object, which is a NEW shape in a response and therefore exactly
 * the kind of thing 007's `ApiPage<T>` defect was. Five features of lists could
 * never load a second page because a stub and a type agreed with each other and
 * neither agreed with the server.
 */
describe('008/SC-009 finding a post by its words', () => {
  /**
   * A per-run suffix on every distinctive word.
   *
   * The local table is shared across runs, and this suite's whole method is to
   * search for a word only one post contains. Without a nonce, the second run
   * finds the first run's post too — which is not a defect and looks exactly
   * like one. CLAUDE.md records two "regressions" that were a grown table.
   */
  const RUN = Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6) || 'zzzzzz';
  const word = (stem: string): string => `${stem}${RUN}`;

  it('finds a post by a distinctive caption word, and not one it does not contain', async () => {
    const author = await actor('psAuthor');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const wanted = await publishReadyImage(author, [interest.interestId], {
      caption: `a morning on the ${word('escarpment')}`,
    });
    await publishReadyImage(author, [interest.interestId], { caption: 'unrelated entirely' });

    const page = await author.data.search.posts(word('escarpment'));
    expect(page.items.map((p) => p.postId)).toEqual([wanted]);

    // A HYDRATED post, not a candidate row. Seven surfaces in this codebase have
    // shipped returning VisibilityFilter's candidates as the response.
    expect({
      caption: page.items[0]?.caption,
      hasAuthor: Boolean(page.items[0]?.author?.handle),
      hasInterests: (page.items[0]?.interests?.length ?? 0) > 0,
    }).toEqual({
      caption: `a morning on the ${word('escarpment')}`,
      hasAuthor: true,
      hasInterests: true,
    });
  }, 180_000);

  it('SC-009 a post the viewer may not see is UNFINDABLE, and its words do not leak', async () => {
    const author = await actor('psPrivateAuthor');
    const stranger = await actor('psStranger');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    await publishReadyImage(author, [interest.interestId], {
      caption: `a private ${word('cairn')}`,
      visibility: 'followers',
    });

    const denied = await stranger.data.search.posts(word('cairn'));
    expect(denied.items).toEqual([]);
    // The whole response, not just the items array: a caption leaking through
    // some other field is the shape six surfaces here have shipped.
    expect(JSON.stringify(denied)).not.toContain('private');
  }, 180_000);

  it('FR-022 a miss carries interests and people in the SAME response', async () => {
    /**
     * THE QUERY IS A NONCE, and both halves of the fallback are built to carry
     * it. That is the only shape of this test that holds on a shared table.
     *
     * Version one searched 'bouldering' — the word this codebase's fixtures use
     * everywhere, and absent from the seeded catalogue, so the fallback was
     * correctly empty and the test failed for its own reason. Version two read a
     * REAL interest's name from the API, passed alone, and failed in the full
     * suite with `items: 3`: other journeys publish captions containing the
     * catalogue's own words, so "an interest with no posts" is not a fact this
     * table can be relied on to hold. CLAUDE.md records two earlier
     * "regressions" that were a grown table, and this is the third.
     *
     * A nonce nothing has ever published cannot be found by any post, however
     * many runs the table has accumulated — and naming a person and a
     * sub-interest with it makes the two fallback halves non-empty BY
     * CONSTRUCTION rather than by luck.
     */
    const nonce = word('psfallback');
    const me = await actor('psFallbackViewer');
    // A SECOND person, because `PersonSearchService` excludes the viewer from
    // their own results — searching as the person carrying the nonce would have
    // reported the fallback empty for a reason that is the product working.
    const named = await actor(nonce);
    const top = (await me.data.interests.listTop({ limit: 1 })).items[0]!;
    const child = await me.data.interests.create({ name: nonce, parentId: top.interestId });

    const page = await me.data.search.posts(nonce);

    /**
     * Read from a REAL response. This is a brand-new shape in a page object, and
     * the last time this codebase added one — `nextCursor` under `page` — every
     * client read it from the wrong level for five features, because the mobile
     * stubs were wrong in exactly the way the type was.
     */
    expect({
      items: page.items.length,
      // The interest and the person named with the nonce must BOTH be there,
      // which is what makes this a test of the fallback rather than of its shape.
      foundInterest: (page.fallback?.interests ?? []).some((i) => i.interestId === child.interestId),
      foundPerson: (page.fallback?.people ?? []).some((p) => p.handle === named.handle),
    }).toEqual({ items: 0, foundInterest: true, foundPerson: true });
  }, 120_000);

  it('reports which words it actually used, so a stop-word query is not a mystery', async () => {
    const me = await actor('psTerms');
    const page = await me.data.search.posts('the and of');
    // Every word dropped. An empty list with no explanation looks like a broken
    // search; `meta.terms` is what tells a person why.
    expect(page.meta?.terms).toEqual([]);
  }, 120_000);

  it('FR-021 searching moves no ranking weight', async () => {
    const me = await actor('psSignals');
    const interest = (await me.data.interests.listTop({ limit: 1 })).items[0]!;
    await publishReadyImage(me, [interest.interestId], { caption: `a ${word('tarn')} at dusk` });

    const before = JSON.stringify(await me.data.signals.disclosure());
    await me.data.search.posts(word('tarn'));
    await me.data.search.posts(word('tarn'));
    const after = JSON.stringify(await me.data.signals.disclosure());
    expect({ before, after }).toEqual({ before, after: before });
  }, 180_000);
});
