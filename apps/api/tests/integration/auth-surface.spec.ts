import request from 'supertest';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { bootHarness, type Harness } from './harness';
import { IS_PUBLIC } from '../../src/common/auth/auth.guard';
import { OperatorGuard } from '../../src/common/auth/operator.guard';

/**
 * WHICH ROUTES ARE PUBLIC, PINNED AS A SNAPSHOT.
 *
 * Written after making the same mistake TWICE in one feature. Inserting a new
 * method above an existing `@Get` puts the insertion BETWEEN that route and the
 * `@Public()` decorator above it. A decorator attaches to whatever follows it,
 * so the decorator silently moves to the new method: the old route starts
 * demanding a token, and the new one stops. Typecheck clean, lint clean.
 *
 * The first version of this test was a hand-picked list of routes, and it did
 * not contain `/people/:handle` - so it did not catch the second occurrence.
 * A hand-picked list only ever covers the mistakes you have already made.
 *
 * This enumerates EVERY route the app registers and compares the public set to
 * an explicit snapshot. A new public route fails here until somebody adds it,
 * which makes "this is readable signed out" a decision rather than an omission.
 */
describe('the public/authenticated boundary', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  /**
   * Every route readable WITHOUT a token. 001/FR-014: a public post is visible
   * to everyone, including people who are not signed in.
   *
   * Adding to this list is a deliberate act. Removing something from it by
   * accident - which is what a displaced decorator does - fails the test.
   */
  const EXPECTED_PUBLIC = [
    'GET /health',
    'GET /interests',
    'GET /interests/similar',
    'GET /interests/:interestId',
    'GET /interests/:interestId/posts',
    'GET /people/:handle',
    'GET /people/:handle/posts',
    'GET /places',
    'GET /places/:placeId',
    'GET /places/:placeId/posts',
    // 005: the only new PUBLIC route. Rating, group creation, adding a
    // participant and leaving are all authenticated, and their absence from this
    // list is what would make a wrongly-public one fail here.
    'GET /places/:placeId/reviews',
    'GET /posts/:postId',
    'GET /posts/:postId/comments',
    // There is deliberately no GET /share/:postId. A share link resolves through
    // GET /posts/{postId}, which is already public and already re-checks
    // visibility on every read (FR-042) - a separate resolution route would be a
    // second read path, and the link would then be the thing granting access
    // rather than the post's own visibility. Writing this list from memory put
    // one here; the snapshot is what said otherwise.
  ].sort();

  /**
   * 008/T199 — THE OPERATOR SURFACE, PINNED THE SAME WAY.
   *
   * The public snapshot above catches a route that stops or starts being
   * readable signed out. It says nothing about a route that stops or starts
   * being MODERATOR-ONLY, and 008/US14 adds an appeal queue and a decision
   * endpoint — the two places where "anybody can reach this" would mean anybody
   * can overturn a moderation decision.
   *
   * Read from the guard metadata Nest actually registered, which is the
   * boot-time route dump the task asks for rather than reading the decorators
   * and believing them. A controller-level `@UseGuards(OperatorGuard)` covers
   * every method on it, which is why this enumerates methods and not classes:
   * a method added to a guarded controller is covered, and a method added to an
   * unguarded one shows up here as missing.
   */
  const EXPECTED_OPERATOR = [
    'GET /moderation/reports',
    'PATCH /moderation/reports/:reportId',
    'PATCH /moderation/interests/:interestId',
    // 008/US14.
    'GET /moderation/appeals',
    'PATCH /moderation/appeals/:appealId',
  ].sort();

  /**
   * NEST'S OWN `RequestMethod` ORDER, and the previous version of this array had
   * it wrong: `['GET','POST','PUT','PATCH','DELETE']` maps 3 to PATCH and 4 to
   * DELETE where Nest means the opposite. It never showed, because every route
   * in the public snapshot is a GET — index 0 — so the only entries this file
   * ever rendered were the ones the mistake could not reach.
   *
   * Found by 008/T199, the moment a snapshot enumerated PATCH routes.
   */
  const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL'] as const;

  function actualPublicRoutes(): string[] {
    const found: string[] = [];
    // Walk the controllers Nest actually instantiated, so a controller that is
    // registered but never reached still counts.
    const controllers = (h.module as unknown as { container: { getModules(): Map<string, { controllers: Map<unknown, { metatype?: new (...a: never[]) => unknown }> }> } }).container.getModules();
    for (const mod of controllers.values()) {
      for (const wrapper of mod.controllers.values()) {
        const ctor = wrapper.metatype;
        if (!ctor) continue;
        const base = (Reflect.getMetadata(PATH_METADATA, ctor) as string) ?? '';
        for (const name of Object.getOwnPropertyNames(ctor.prototype)) {
          if (name === 'constructor') continue;
          const handler = (ctor.prototype as Record<string, unknown>)[name];
          if (typeof handler !== 'function') continue;
          const isPublic = Reflect.getMetadata(IS_PUBLIC, handler) === true;
          if (!isPublic) continue;
          const path = (Reflect.getMetadata(PATH_METADATA, handler) as string) ?? '';
          const methodIndex = Reflect.getMetadata(METHOD_METADATA, handler) as number;
          const method = METHODS[methodIndex] ?? String(methodIndex);
          const full = `/${[base, path].filter((p) => p && p !== '/').join('/')}`;
          found.push(`${method} ${full}`);
        }
      }
    }
    return found.sort();
  }

  function actualOperatorRoutes(): string[] {
    const found: string[] = [];
    const modules = (h.module as unknown as { container: { getModules(): Map<string, { controllers: Map<unknown, { metatype?: new (...a: never[]) => unknown }> }> } }).container.getModules();
    for (const mod of modules.values()) {
      for (const wrapper of mod.controllers.values()) {
        const ctor = wrapper.metatype;
        if (!ctor) continue;
        const base = (Reflect.getMetadata(PATH_METADATA, ctor) as string) ?? '';
        const classGuards = (Reflect.getMetadata(GUARDS_METADATA, ctor) as unknown[]) ?? [];
        for (const name of Object.getOwnPropertyNames(ctor.prototype)) {
          if (name === 'constructor') continue;
          const handler = (ctor.prototype as Record<string, unknown>)[name];
          if (typeof handler !== 'function') continue;
          const methodGuards = (Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? [];
          if (![...classGuards, ...methodGuards].includes(OperatorGuard)) continue;
          const path = (Reflect.getMetadata(PATH_METADATA, handler) as string) ?? '';
          const methodIndex = Reflect.getMetadata(METHOD_METADATA, handler) as number;
          const method = METHODS[methodIndex] ?? String(methodIndex);
          const full = `/${[base, path].filter((p) => p && p !== '/').join('/')}`;
          found.push(`${method} ${full}`);
        }
      }
    }
    return found.sort();
  }

  it('exactly these routes require an operator - no more, no fewer', () => {
    // Both directions again. A moderation route that LOSES the guard is a
    // decision anybody can overturn; an ordinary route that GAINS it is a
    // feature that silently stops working for everybody who is not staff.
    expect(actualOperatorRoutes()).toEqual(EXPECTED_OPERATOR);
  });

  it('an operator route refuses an ordinary signed-in caller', async () => {
    const token = await h.token(await h.createPerson('notAModerator'));
    for (const route of ['/v1/moderation/reports', '/v1/moderation/appeals']) {
      const res = await request(h.app.getHttpServer())
        .get(route)
        .set('authorization', `Bearer ${token}`);
      // 403, not 401: the caller IS authenticated and is simply not staff.
      expect({ route, status: res.status }).toEqual({ route, status: 403 });
    }
  });

  it('exactly these routes are public - no more, no fewer', () => {
    // Both directions matter. A route that STOPS being public breaks signed-out
    // reading; one that STARTS being public is a write anybody can reach.
    expect(actualPublicRoutes()).toEqual(EXPECTED_PUBLIC);
  });

  it('a public read really is readable with no token', async () => {
    for (const route of ['/v1/interests', '/v1/places?q=x&locality=y']) {
      const res = await request(h.app.getHttpServer()).get(route);
      expect({ route, status: res.status }).not.toEqual({ route, status: 401 });
    }
  });

  it('an unmarked write really does refuse an anonymous caller', async () => {
    const writes: { method: 'post' | 'put' | 'patch' | 'delete'; path: string }[] = [
      { method: 'put', path: '/v1/interests/anything/description' },
      { method: 'post', path: '/v1/places' },
      { method: 'post', path: '/v1/posts' },
      { method: 'post', path: '/v1/reports' },
      { method: 'put', path: '/v1/conversations/with/anyone' },
    ];
    for (const { method, path } of writes) {
      const res = await request(h.app.getHttpServer())[method](path).send({});
      // 401 specifically: a 404 would also "refuse" while meaning the route had
      // vanished, and this test must not disguise that as a pass.
      expect({ method, path, status: res.status }).toEqual({ method, path, status: 401 });
    }
  });
});
