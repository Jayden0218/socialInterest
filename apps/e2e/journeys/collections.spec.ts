import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

/**
 * 008/T204, US15 — FR-049 and FR-051, over HTTP, through the app's own data
 * layer.
 *
 * TWO BUGS THIS EXISTS TO CATCH, and neither is visible to a unit test of the
 * service:
 *
 * 1. **A COLLECTION ADD THAT IS A MOVE.** Filing a post takes it out of the
 *    undifferentiated saved list. Nobody sees it until they go looking for a
 *    post they know they saved, which is long after the move happened — and by
 *    then the saved list looks like it lost something rather than like a feature
 *    working as built. FR-051 exists because this is the natural implementation.
 * 2. **ONE POST, ONE COLLECTION.** The key shape allows a post in several
 *    (`COLLITEM#<collectionId>#<savedAt>#<postId>`), but a fixture with one
 *    collection can never tell that apart from an implementation that overwrites.
 *    That is the half of FR-049 a single-collection test cannot exercise, and it
 *    is the same shape as 008's own `media[0]` defect: 190 green tests said
 *    nothing because every fixture had exactly one item.
 *
 * Driven through `apps/mobile/src/data`, not a generated client: 002 recorded
 * that both sides generated from one document agree with each other by
 * construction, and only a request finds the disagreement.
 */
describe('008/US15 collections are shelves, not boxes', () => {
  it('FR-051 filing a post leaves it in the saved list, and FR-049 it can be in two collections', async () => {
    const me = await actor('collections');
    const author = await actor('collectionsauthor');
    const interest = (await me.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], {
      caption: 'a post worth filing twice',
    });

    const cooking = await me.data.saved.createCollection('Things to cook');
    const reading = await me.data.saved.createCollection('Read later');
    expect(cooking.collectionId).not.toEqual(reading.collectionId);

    /**
     * ADDED TO A COLLECTION WITHOUT EVER BEING SAVED FIRST.
     *
     * The transaction writes the membership row AND the save, so FR-051 holds
     * even on the path where nothing was saved beforehand — which is the path a
     * "move" implementation would pass, because there is nothing to move.
     */
    await me.data.saved.addToCollection(cooking.collectionId, postId);

    const savedAfterFirst = await me.data.saved.list({ limit: 50 });
    expect(savedAfterFirst.items.map((p) => p.postId)).toContain(postId);

    const inCooking = await me.data.saved.collectionPosts(cooking.collectionId, { limit: 50 });
    expect(inCooking.items.map((p) => p.postId)).toContain(postId);

    // FR-049's other half: the SAME post in a SECOND collection, both non-empty.
    await me.data.saved.addToCollection(reading.collectionId, postId);
    const inReading = await me.data.saved.collectionPosts(reading.collectionId, { limit: 50 });
    expect({
      cooking: (await me.data.saved.collectionPosts(cooking.collectionId, { limit: 50 })).items.map(
        (p) => p.postId,
      ),
      reading: inReading.items.map((p) => p.postId),
    }).toEqual({ cooking: [postId], reading: [postId] });

    // And still exactly ONE row in the saved list — the second add must reuse
    // the save that is already there rather than writing a duplicate under a
    // fresh `savedAt` that no unsave can reach.
    const savedAfterSecond = await me.data.saved.list({ limit: 50 });
    expect(savedAfterSecond.items.filter((p) => p.postId === postId)).toHaveLength(1);

    /**
     * FR-051'S CONVERSE, twice over. Taking a post out of one collection leaves
     * the save AND the other collection; deleting a collection leaves both.
     */
    await me.data.saved.removeFromCollection(cooking.collectionId, postId);
    expect(
      (await me.data.saved.collectionPosts(cooking.collectionId, { limit: 50 })).items,
    ).toEqual([]);
    expect((await me.data.saved.list({ limit: 50 })).items.map((p) => p.postId)).toContain(postId);
    expect(
      (await me.data.saved.collectionPosts(reading.collectionId, { limit: 50 })).items.map(
        (p) => p.postId,
      ),
    ).toContain(postId);

    await me.data.saved.deleteCollection(reading.collectionId);
    expect((await me.data.saved.collections({ limit: 50 })).items.map((c) => c.collectionId)).not.toContain(
      reading.collectionId,
    );
    // The person tidied their shelves; they did not ask to lose the book.
    expect((await me.data.saved.list({ limit: 50 })).items.map((p) => p.postId)).toContain(postId);
  }, 120_000);

  it('FR-049 a collection cannot hold a post its owner cannot see', async () => {
    const me = await actor('collectionsnosee');
    const author = await actor('collectionsprivate');
    const interest = (await me.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], {
      caption: 'followers only',
      visibility: 'followers',
    });

    const shelf = await me.data.saved.createCollection('Not mine to keep');
    // Collecting a post you cannot see would make a collection a record of what
    // EXISTS rather than of what you chose — the same rule the saved list has.
    await expect(me.data.saved.addToCollection(shelf.collectionId, postId)).rejects.toMatchObject({
      status: 404,
    });
  }, 120_000);
});
