import { resolveContract } from '../../../../packages/shared/scripts/contract';
import { operations } from '@sih/shared';

// The RESOLVED contract - base + contracts/openapi.overlay.yaml - read through the
// one resolver the client generator also uses, so the two cannot read different
// documents. See contracts/README.md.
const spec = resolveContract();

describe('contract — /interests operations are generated from the spec', () => {
  it('browse and search is public (FR-025, FR-026)', () => {
    expect(operations.getInterests).toEqual({ method: 'GET', path: '/interests', auth: false });
  });

  it('creation requires auth (FR-022)', () => {
    expect(operations.postInterests).toEqual({ method: 'POST', path: '/interests', auth: true });
  });

  it('the near-duplicate check is its own operation (FR-023)', () => {
    // Separate from POST on purpose: the warning must appear while typing.
    expect(operations.getInterestsSimilar).toEqual({
      method: 'GET',
      path: '/interests/similar',
      auth: true,
    });
  });

  it('interest detail and its post listing are public', () => {
    expect(operations.getInterestsByInterestId.auth).toBe(false);
    expect(operations.getInterestsByInterestIdPosts.auth).toBe(false);
  });
});

describe('contract — declared statuses match what the implementation returns', () => {
  it('POST /interests declares 409 for the near-duplicate candidates response', () => {
    const responses = spec.paths['/interests']!['post']!.responses!;
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(['201', '409', '422', '429']));
  });

  it('GET /interests/{interestId} declares the 301 a merged interest returns (FR-030)', () => {
    const responses = spec.paths['/interests/{interestId}']!['get']!.responses!;
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(['200', '301', '404']));
  });
});
