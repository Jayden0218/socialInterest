import { multiImagePost, partiallyFailedPost, singleImagePost, tenImagePost } from './post';

/**
 * 008/T009. The fixture asserts its own shape.
 *
 * This looks like testing a constant, and it is - deliberately. The defect these
 * fixtures exist to catch survived because every fixture had ONE media item, so
 * a "renders every item" assertion would have passed against a renderer that
 * read only the first. If someone later trims these arrays to simplify a test,
 * the multi-item guarantees elsewhere go quietly vacuous. This fails instead.
 */
describe('the media fixtures actually carry more than one item', () => {
  it('single is one, multi is three, ten is ten', () => {
    expect({
      single: singleImagePost.media?.length,
      multi: multiImagePost.media?.length,
      ten: tenImagePost.media?.length,
    }).toEqual({ single: 1, multi: 3, ten: 10 });
  });

  it('the partially failed fixture has both ready and failed items', () => {
    const states = partiallyFailedPost.media!.map((m) => m.processingState);
    expect({ ready: states.filter((s) => s === 'ready').length, failed: states.filter((s) => s === 'failed').length })
      .toEqual({ ready: 2, failed: 1 });
  });

  it('every item in a multi fixture is distinguishable, so "renders all" cannot pass by rendering one twice', () => {
    const uris = multiImagePost.media!.map((m) => m.renditions?.original);
    expect(new Set(uris).size).toBe(3);
  });
});
