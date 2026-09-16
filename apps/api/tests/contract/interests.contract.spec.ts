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

  /**
   * 013/FR-004. REPLACES "creation requires auth (FR-022)".
   *
   * `POST /interests` is gone: it created an interest with no posts, which
   * FR-004 makes unrepresentable. The gesture that creates one is publishing
   * into it, so what needs pinning is that the operation is REALLY absent from
   * the generated client — the removal is what surfaced a dead `create()` in
   * `apps/mobile/src/data/interests.ts` calling it.
   */
  it('there is no standalone create operation (FR-004)', () => {
    expect(operations).not.toHaveProperty('postInterests');
    expect(spec.paths['/interests']!['post']).toBeUndefined();
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
  /**
   * 013/FR-009. THE 409 MOVED WITH THE GESTURE, AND THE CONTRACT HAD NOT.
   *
   * It was declared on `POST /interests`, which 013 deleted. The server returns
   * it from `POST /posts` now — and the document still said 201/422/429, so a
   * client generated from the contract had no idea the near-duplicate refusal
   * existed. That is 002's first defect exactly: the contract and the API
   * disagreeing, each looking right alone. Found by moving this assertion
   * rather than deleting it.
   */
  it('POST /posts declares the 409 a near-duplicate interest name returns', () => {
    const responses = spec.paths['/posts']!['post']!.responses!;
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(['201', '409', '422', '429']));
    // The SCHEMA too, not only the status: a 409 declared with no body is a
    // refusal a generated client cannot read the candidates out of, which is
    // the half of FR-009 that makes it a choice rather than an error message.
    const body = responses['409'] as {
      content?: Record<string, { schema?: { $ref?: string } }>;
    };
    expect(body.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/DuplicateInterestCandidates',
    );
  });

  it('GET /interests/{interestId} declares the 301 a merged interest returns (FR-030)', () => {
    const responses = spec.paths['/interests/{interestId}']!['get']!.responses!;
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(['200', '301', '404']));
  });
});
