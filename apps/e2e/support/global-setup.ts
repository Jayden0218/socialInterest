import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { startApi } from './api-process';
import { resetStore } from './reset';

/**
 * One store reset and one API process for the whole suite. Per-file boots would
 * cost several seconds each and, sharing one table, would race. jest runs this
 * suite with --runInBand for the same reason.
 */
export default async function globalSetup(): Promise<void> {
  resetStore();

  /**
   * Build the browser bundle here, with a RELATIVE API base. The bundle inlines
   * that value at build time, so an absolute URL baked in by an earlier manual
   * build would silently point the browser journeys at the wrong API - or at a
   * cross-origin one, which fails on CORS. Building it in setup makes that
   * impossible rather than merely documented.
   */
  execFileSync('pnpm', ['--filter', '@sih/mobile', 'build:web'], {
    cwd: resolve(__dirname, '../../..'),
    env: { ...process.env, EXPO_PUBLIC_API_BASE_URL: '/v1' },
    stdio: 'pipe',
  });
  process.env['E2E_BASE_URL'] = await startApi(Number(process.env['E2E_API_PORT'] ?? 3111));
}
