import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * WHICH ENDPOINTS ARE PUBLIC, ASSERTED RATHER THAN DECORATED.
 *
 * Written after a real mistake: inserting a new method above `@Get(':interestId')`
 * put the insertion BETWEEN that route and the `@Public()` decorator above it.
 * The decorator silently moved to the new method, so the interest detail became
 * authenticated (401 to every signed-out reader) and a WRITE endpoint became
 * public. Typecheck and lint were clean; only a request noticed.
 *
 * A decorator attaches to whatever follows it. That is invisible in a diff and
 * catastrophic in one direction, so the surface is pinned here instead of
 * trusted to review.
 */
describe('the public/authenticated boundary', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  /**
   * Readable signed out. 001/FR-014: a public post is visible to everyone,
   * including people who are not signed in - so the surfaces that carry them
   * must not demand a token.
   */
  const PUBLIC_READS = [
    '/v1/interests',
    '/v1/interests/similar?name=x&parentId=y',
    '/v1/places?q=x&locality=y',
  ];

  /**
   * Must refuse an anonymous caller. Every one of these WRITES, and a write
   * reachable without a token is not a bug you find later - it is the whole
   * safety surface gone.
   */
  const MUST_REQUIRE_AUTH: { method: 'post' | 'put' | 'patch' | 'delete'; path: string }[] = [
    { method: 'put', path: '/v1/interests/anything/description' },
    { method: 'post', path: '/v1/places' },
    { method: 'put', path: '/v1/places/anything/follow' },
    { method: 'delete', path: '/v1/places/anything/follow' },
    { method: 'patch', path: '/v1/places/anything' },
    { method: 'post', path: '/v1/posts' },
    { method: 'post', path: '/v1/reports' },
    { method: 'put', path: '/v1/conversations/with/anyone' },
    { method: 'post', path: '/v1/conversations/anything/messages' },
    { method: 'post', path: '/v1/conversations/anything/accept' },
  ];

  for (const path of PUBLIC_READS) {
    it(`GET ${path} is readable signed out`, async () => {
      const res = await request(h.app.getHttpServer()).get(path);
      expect({ path, status: res.status }).not.toEqual({ path, status: 401 });
    });
  }

  for (const { method, path } of MUST_REQUIRE_AUTH) {
    it(`${method.toUpperCase()} ${path} refuses an anonymous caller`, async () => {
      const res = await request(h.app.getHttpServer())[method](path).send({});
      // 401 specifically. A 404 would also "refuse", but it would mean the
      // route is missing rather than guarded - and a route that stops existing
      // is a different failure that this test must not disguise as a pass.
      expect({ method, path, status: res.status }).toEqual({ method, path, status: 401 });
    });
  }
});
