import {
  mergeContract,
  resolveContract,
  type OpenApiDoc,
} from '../../../../packages/shared/scripts/contract';

/**
 * ===========================================================================
 * THE CONTRACT OVERLAY, EXERCISED WITH A NON-EMPTY OVERLAY.
 * ===========================================================================
 *
 * Upstream ships an empty `contracts/openapi.overlay.yaml`, so `resolveContract()`
 * alone never once performs a real merge. Without this file the seam would be
 * green forever here and broken the first time a fork used it - the same
 * declared-half-with-no-other-half this repository has now found five times, and
 * Principle V's point that a green run against one configuration says nothing
 * about another.
 *
 * `mergeContract` is pure and separate from the file reading precisely so this
 * can drive it. Each refusal below is a real merge that must NOT silently
 * succeed: a silently overridden operation would leave the generated client
 * describing the overlay's version while the base's server still implemented the
 * other, and both would look right alone. That is 002's first defect, which cost
 * every client a 400 on every publish.
 */

const base: OpenApiDoc = {
  openapi: '3.1.0',
  info: { title: 'base', version: '1' },
  paths: {
    '/posts/{postId}': {
      get: { summary: 'Read a post', security: [], responses: { '200': { description: 'OK' } } },
    },
    '/interests': {
      get: { summary: 'Browse', security: [], responses: { '200': { description: 'OK' } } },
    },
  },
  components: { schemas: { Post: { type: 'object' } }, securitySchemes: { bearer: {} } },
};

describe('the contract overlay merges', () => {
  it('an empty overlay leaves the base contract exactly as it was', () => {
    const merged = mergeContract(base, {});
    expect(merged.paths).toEqual(base.paths);
    // The upstream case. `components.schemas` is rebuilt by the merge, so this
    // is worth asserting rather than assuming: a merge that dropped
    // securitySchemes would break every authenticated operation in the
    // generated client and nothing else here would notice.
    expect(merged.components?.schemas).toEqual(base.components?.schemas);
    expect(merged.components?.securitySchemes).toEqual(base.components?.securitySchemes);
    expect(merged.info).toEqual(base.info);
  });

  it('adds a path the base does not declare', () => {
    const merged = mergeContract(base, {
      paths: {
        '/fork/widgets': {
          get: { summary: 'List widgets', security: [], responses: { '200': { description: 'OK' } } },
        },
      },
    });
    expect(Object.keys(merged.paths).sort()).toEqual([
      '/fork/widgets',
      '/interests',
      '/posts/{postId}',
    ]);
    expect(merged.paths['/posts/{postId}']).toEqual(base.paths['/posts/{postId}']);
  });

  /**
   * ALLOWED, and worth a test of its own because the stricter rule is the
   * tempting one. Refusing at PATH granularity would block this - a fork adding
   * `DELETE /posts/{postId}` beside the base's `GET` is additive and
   * unambiguous - to catch nothing the operation-level check does not catch.
   */
  it('adds a verb to a path the base already declares, keeping the base verb', () => {
    const merged = mergeContract(base, {
      paths: {
        '/posts/{postId}': {
          delete: { summary: 'Delete a post', responses: { '204': { description: 'Gone' } } },
        },
      },
    });
    expect(Object.keys(merged.paths['/posts/{postId}']!).sort()).toEqual(['delete', 'get']);
    expect(merged.paths['/posts/{postId}']!['get']).toEqual(base.paths['/posts/{postId}']!['get']);
  });

  it('adds a schema the base does not declare', () => {
    const merged = mergeContract(base, {
      components: { schemas: { Widget: { type: 'object' } } },
    });
    expect(Object.keys(merged.components?.schemas ?? {}).sort()).toEqual(['Post', 'Widget']);
  });
});

describe('the contract overlay refuses', () => {
  it('an operation the base already declares', () => {
    expect(() =>
      mergeContract(base, {
        paths: { '/posts/{postId}': { get: { summary: 'Read a post, differently' } } },
      }),
    ).toThrow(/redefines operation\(s\).*GET \/posts\/\{postId\}/s);
  });

  it('a schema the base already declares', () => {
    expect(() =>
      mergeContract(base, { components: { schemas: { Post: { type: 'string' } } } }),
    ).toThrow(/redefines schema\(s\).*Post/s);
  });

  it('a top-level key that is not paths or components', () => {
    // An overlay that could set `servers` would not be an overlay - it would be
    // a second contract quietly replacing the first.
    expect(() =>
      mergeContract(base, { servers: [{ url: 'https://fork.example' }] } as Partial<OpenApiDoc>),
    ).toThrow(/may only contain paths and components, found servers/);
  });

  it('a components key that is not schemas', () => {
    expect(() =>
      mergeContract(base, { components: { securitySchemes: { apiKey: {} } } }),
    ).toThrow(/components may only contain schemas, found securitySchemes/);
  });
});

describe('the resolved contract', () => {
  /**
   * The real files, read the way both consumers read them. This is the half
   * that would catch a moved base contract or an overlay that stopped parsing -
   * neither of which the pure merge above can see.
   */
  it('reads the base contract and is non-empty', () => {
    const spec = resolveContract();
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
    expect(spec.paths['/posts']).toBeDefined();
  });

  it('is unchanged by this repository\'s empty overlay', () => {
    // Upstream's overlay contributes nothing, and that is an assertion rather
    // than an assumption: an overlay accidentally committed here would change
    // the contract the API is tested against and the client is generated from.
    const spec = resolveContract();
    const withoutOverlay = mergeContract(spec, {});
    expect(spec.paths).toEqual(withoutOverlay.paths);
  });
});
