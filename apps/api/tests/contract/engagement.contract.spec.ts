import { resolveContract } from '../../../../packages/shared/scripts/contract';
import { operations } from '@sih/shared';

// The RESOLVED contract - base + contracts/openapi.overlay.yaml - read through the
// one resolver the client generator also uses, so the two cannot read different
// documents. See contracts/README.md.
const spec = resolveContract();

describe('contract — engagement operations', () => {
  it('reaction is PUT/DELETE, so it is idempotent by shape (FR-039)', () => {
    expect(operations.putPostsByPostIdReaction.method).toBe('PUT');
    expect(operations.deletePostsByPostIdReaction.method).toBe('DELETE');
  });

  it('comments are readable signed out, writable only signed in (FR-040)', () => {
    expect(operations.getPostsByPostIdComments.auth).toBe(false);
    expect(operations.postPostsByPostIdComments.auth).toBe(true);
  });

  it('share-link creation requires auth — a link is issued, never guessed', () => {
    expect(operations.postPostsByPostIdShareLink.auth).toBe(true);
  });
});

describe('contract — declared statuses match the implementation', () => {
  it('comments declare 403 for a post the viewer cannot open', () => {
    const responses = spec.paths['/posts/{postId}/comments']!['get']!.responses!;
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(['200', '403']));
  });

  it('share-link declares 403 for a post the caller cannot see', () => {
    const responses = spec.paths['/posts/{postId}/share-link']!['post']!.responses!;
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(['201', '403']));
  });

  it('commenting declares 429, so the rate limit is part of the contract (FR-046)', () => {
    const responses = spec.paths['/posts/{postId}/comments']!['post']!.responses!;
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(['201', '403', '429']));
  });
});
