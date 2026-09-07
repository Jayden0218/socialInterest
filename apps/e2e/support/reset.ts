import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * T008. Recreates the table, bucket and seeded catalogue between runs.
 *
 * Deliberately shells out to the infra scripts rather than reimplementing the
 * key schema. A second copy of the GSI definitions would drift from
 * data-model.md silently, and the suite would then be testing a table shape the
 * product does not use.
 */
const REPO_ROOT = resolve(__dirname, '../../..');

const run = (script: string, args: string[] = []): void => {
  execFileSync('pnpm', ['--filter', '@sih/infra', script, ...args], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
  });
};

export function resetStore(): void {
  run('db:create-local', ['--recreate']);
  run('s3:create-local');
  run('seed:catalogue');
}
