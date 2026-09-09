/**
 * Boots the app THE WAY PRODUCTION DOES - under tsx - and exercises one route
 * per controller.
 *
 * This exists because the jest suites run under ts-jest, which emits
 * `design:paramtypes`, while tsx/esbuild does not. Type-reflection DI therefore
 * works in tests and silently injects `undefined` at runtime: every controller
 * returned 500 while the integration suite was green.
 *
 * Run with the same runner as `pnpm dev`, or it proves nothing.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ProblemFilter } from '../src/common/errors/problem.filter';

async function main(): Promise<void> {
  /**
   * `abortOnError: false` matters more than it looks. By default Nest handles a
   * bootstrap error ITSELF - it logs the cause through the logger and calls
   * `process.exit(1)` - and `logger: false` turns that log off, so a missing
   * LOCAL_JWT_SECRET exited non-zero having printed NOTHING AT ALL. A catch
   * around this call does not help: the process is gone before the promise
   * settles. Verified by running it both ways.
   */
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new ProblemFilter());
  await app.listen(0);

  const url = await app.getUrl();

  // Resolve a real interest so the listing check exercises the happy path
  // rather than only the not-found branch.
  const { CATALOGUE_SEARCH } = await import('../src/modules/interests/catalogue.cache');
  const catalogue = app.get<{ childrenOf(id: string): { interestId: string }[] }>(CATALOGUE_SEARCH);
  const realInterest = catalogue.childrenOf('ROOT')[0]?.interestId;

  const checks: { name: string; path: string; method?: string; expect: number[] }[] = [
    { name: 'health', path: '/v1/health', expect: [200] },
    { name: 'interest browse', path: '/v1/interests?level=top', expect: [200] },
    ...(realInterest
      ? [{ name: 'interest space (real)', path: `/v1/interests/${realInterest}/posts`, expect: [200] }]
      : []),
    // An unknown interest is a 404, not an empty listing.
    { name: 'interest space (unknown)', path: '/v1/interests/none/posts', expect: [404] },
    { name: 'interest detail (unknown)', path: '/v1/interests/none', expect: [404] },
    { name: 'profile posts', path: '/v1/people/nobody/posts', expect: [404] },
    { name: 'post detail', path: '/v1/posts/none', expect: [404] },
    { name: 'upload (unauth)', path: '/v1/media/uploads', method: 'POST', expect: [401] },
    { name: 'publish (unauth)', path: '/v1/posts', method: 'POST', expect: [401] },
    /**
     * 008/US2. A 401, not a 404 — which is the whole point of checking it here.
     *
     * `@Controller('v1')` under the global `v1` prefix gives `/v1/v1/...`, and
     * every 007 signals route answered 404 for exactly that reason: invisible to
     * typecheck, to lint, and to this script, which checked OTHER controllers.
     * A route that is registered where the contract says it is answers 401 for a
     * caller with no token; a route that is not registered answers 404.
     */
    { name: 'mark notifications read (unauth)', path: '/v1/notifications/read', method: 'PUT', expect: [401] },
    { name: 'following feed (unauth)', path: '/v1/feed/following', expect: [401] },
    { name: 'post search (unauth)', path: '/v1/search/posts?q=x', expect: [401] },
    /**
     * Phase C. Each of these is a controller that boots under `tsx`, which does
     * NOT emit decorator metadata the way ts-jest does — this step exists to
     * catch DI that works in tests and not in production, and 007's signals
     * routes answered 500 in exactly that gap.
     */
    { name: 'drafts (unauth)', path: '/v1/me/drafts', expect: [401] },
    { name: 'save draft (unauth)', path: '/v1/me/drafts', method: 'POST', expect: [401] },
    {
      name: 'edit comment (unauth)',
      path: '/v1/posts/none/comments/none',
      method: 'PATCH',
      expect: [401],
    },
    {
      name: 'delete comment (unauth)',
      path: '/v1/posts/none/comments/none',
      method: 'DELETE',
      expect: [401],
    },
    /**
     * Phase D. Same argument as the Phase C routes above: this boots under
     * `tsx`, which does not emit decorator metadata the way ts-jest does, so a
     * controller that resolves in the integration harness and not in production
     * fails HERE rather than on a device twenty minutes into a run.
     *
     * `AppealService` is provided by `ModerationModule` while its repository
     * comes from the global persistence module — exactly the arrangement that
     * left `DraftController` unable to boot in Phase C.
     */
    { name: 'follow requests (unauth)', path: '/v1/me/follow-requests', expect: [401] },
    {
      name: 'approve follow request (unauth)',
      path: '/v1/me/follow-requests/nobody',
      method: 'PUT',
      expect: [401],
    },
    { name: 'moderation notices (unauth)', path: '/v1/me/moderation-notices', expect: [401] },
    { name: 'my appeals (unauth)', path: '/v1/me/appeals', expect: [401] },
    { name: 'file appeal (unauth)', path: '/v1/appeals', method: 'POST', expect: [401] },
    /**
     * 403, not 401 — and this route is here because the two were confused until
     * 008/T199. It is reached WITHOUT a token, so the auth guard answers first
     * and the answer is 401; the operator guard's own 403 is asserted in
     * `auth-surface.spec.ts`, which has a token to send.
     */
    { name: 'appeal queue (unauth)', path: '/v1/moderation/appeals', expect: [401] },
  ];

  let failed = 0;
  for (const c of checks) {
    const res = await fetch(`${url.replace('[::1]', '127.0.0.1')}${c.path}`, {
      method: c.method ?? 'GET',
      ...(c.method === 'POST'
        ? { headers: { 'content-type': 'application/json' }, body: '{}' }
        : {}),
    });
    const ok = c.expect.includes(res.status);
    // A 500 here means a dependency resolved to undefined - the exact failure
    // this script exists to catch.
    if (!ok) failed++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.name} -> ${res.status} (expected ${c.expect.join('|')})`);
  }

  await app.close();
  console.log(`\n${checks.length - failed}/${checks.length} routes healthy under the production runner\n`);
  if (failed) process.exit(1);
}

/**
 * `logger: false` silences Nest's own bootstrap handler, which logs the cause
 * and then calls `process.exit(1)` itself - so a configuration error (a missing
 * LOCAL_JWT_SECRET, say) exits non-zero having printed NOTHING AT ALL. That is
 * the most expensive failure shape this project knows: invisible, and therefore
 * guessed at. Print the cause before the exit code is all anybody gets.
 */
void main().catch((err: unknown) => {
  console.error('\nsmoke:boot failed before any route was checked:\n');
  console.error(err);
  process.exit(1);
});
