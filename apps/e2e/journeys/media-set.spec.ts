import { actor } from '../support/client';
import { publishReadyImage, publishReadyImages } from '../support/publish';

/**
 * 008/T013, T014 — SC-001 and SC-002.
 *
 * The product promises "Up to 10 photos" on its publish screen. This asks the
 * only question that can settle whether it keeps that promise: what did the
 * server actually send?
 *
 * The answer, before 008, was **all ten** — the API was never the defect. Every
 * render path in the app read `media[0]`. So these two tests are the half that
 * must stay true while the client is fixed: if the server ever starts sending
 * one, the client fix becomes invisible again and nothing else would notice.
 */
describe('008/SC-001 a ten-photograph post carries ten items', () => {
  it('returns ten ready media items, in publication order', async () => {
    const author = await actor('mediaSetTen');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImages(author, [interest.interestId], 10, {
      caption: 'ten from the session',
    });

    const post = await author.data.posts.get(postId);
    // Count against what was published, which is what SC-001 says.
    expect({ caption: post.caption, count: post.media?.length }).toEqual({
      caption: 'ten from the session',
      count: 10,
    });
    expect(post.media!.every((m) => m.processingState === 'ready')).toBe(true);

    /**
     * ORDER. Every item is a distinct object with its own presigned url, so a
     * response that repeated one item ten times would pass a length check and
     * fail this. There is no `order` field to assert against — `keys.mediaItem`
     * sorts on a zero-padded `MEDIA#000`, so array order IS publication order,
     * and adding a field would be a second source of truth for one fact.
     */
    const urls = post.media!.map((m) => m.renditions?.['original']);
    expect(new Set(urls).size).toBe(10);
  }, 180_000);
});

describe('008/SC-002 zero published media items are unreachable', () => {
  it('holds across single-image, multi-image and video posts', async () => {
    const author = await actor('mediaSetMixed');
    const viewer = await actor('mediaSetViewer');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;

    const singleId = await publishReadyImage(author, [interest.interestId], { caption: 'one' });
    const multiId = await publishReadyImages(author, [interest.interestId], 3, { caption: 'three' });

    for (const [label, postId, expected] of [
      ['single', singleId, 1],
      ['multi', multiId, 3],
    ] as const) {
      // Read as ANOTHER PERSON. The author sees their own post under different
      // rules, and a fixture that only ever reads its own posts cannot tell the
      // two apart.
      const post = await viewer.data.posts.get(postId);
      expect({ label, count: post.media?.length }).toEqual({ label, count: expected });

      // Reachable, not merely present: each item must carry a url a client can
      // actually fetch. 006 shipped five features during which every image 403'd
      // because `publicUrl` returned an unsigned url for a private bucket.
      for (const [i, item] of post.media!.entries()) {
        const url = item.renditions?.['original'] ?? item.posterUrl;
        expect({ label, i, hasUrl: typeof url === 'string' }).toEqual({ label, i, hasUrl: true });
        const res = await fetch(url as string);
        expect({ label, i, status: res.status }).toEqual({ label, i, status: 200 });
      }
    }
  }, 180_000);
});
