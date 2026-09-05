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
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new ProblemFilter());
  await app.listen(0);

  const url = await app.getUrl();
  const checks: { name: string; path: string; method?: string; expect: number[] }[] = [
    { name: 'health', path: '/v1/health', expect: [200] },
    { name: 'interest space', path: '/v1/interests/none/posts', expect: [200] },
    { name: 'profile posts', path: '/v1/people/nobody/posts', expect: [404] },
    { name: 'post detail', path: '/v1/posts/none', expect: [404] },
    { name: 'upload (unauth)', path: '/v1/media/uploads', method: 'POST', expect: [401] },
    { name: 'publish (unauth)', path: '/v1/posts', method: 'POST', expect: [401] },
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

void main();
