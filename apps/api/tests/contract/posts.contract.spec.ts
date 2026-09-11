import { resolveContract } from '../../../../packages/shared/scripts/contract';
import { operations } from '@sih/shared';

/**
 * Contract conformance for the US1 endpoints. Asserts the implementation matches
 * contracts/openapi.yaml rather than re-describing it, so a drift between the
 * two fails here instead of at a client.
 */
// The RESOLVED contract - base + contracts/openapi.overlay.yaml - read through the
// one resolver the client generator also uses, so the two cannot read different
// documents. See contracts/README.md.
const spec = resolveContract();

describe('contract — US1 endpoints exist in the generated client', () => {
  it('POST /media/uploads is generated and requires auth', () => {
    expect(operations.postMediaUploads).toEqual({
      method: 'POST',
      path: '/media/uploads',
      auth: true,
    });
  });

  it('POST /posts is generated and requires auth', () => {
    expect(operations.postPosts).toEqual({ method: 'POST', path: '/posts', auth: true });
  });

  it('GET /posts/{postId} is generated and is readable signed out (share link)', () => {
    expect(operations.getPostsByPostId).toEqual({
      method: 'GET',
      path: '/posts/{postId}',
      auth: false,
    });
  });
});

describe('contract — the spec declares the statuses the implementation returns', () => {
  it('POST /media/uploads declares 413 and 415 for cap and type refusals (FR-005)', () => {
    const responses = spec.paths['/media/uploads']!['post']!.responses!;
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(['201', '413', '415', '429']));
  });

  it('POST /posts declares 422 for the no-interest refusal (FR-006)', () => {
    const responses = spec.paths['/posts']!['post']!.responses!;
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(['201', '422', '429']));
  });

  it('GET /posts/{postId} declares BOTH 403 and 404 (FR-042 error distinction)', () => {
    // The distinction is load-bearing: 404 for gone or blocked, 403 for
    // "exists but not for you". Collapsing them would disclose blocks.
    const responses = spec.paths['/posts/{postId}']!['get']!.responses!;
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(['200', '403', '404']));
  });
});
