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

const run = (script: string, args: string[] = []): string => {
  return execFileSync('pnpm', ['--filter', '@sih/infra', script, ...args], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
  });
};

/**
 * 012/T001. THE OBJECT STORE IS ABSENT IN THE CLOUD SANDBOX, AND THAT MUST NOT
 * COST A CAPTURE RUN.
 *
 * MinIO publishes to quay.io, which this environment's egress blocks outright -
 * CLAUDE.md's dead-ends table, and the reason 008 baselined three API failures
 * as "that" rather than as regressions. So `s3:create-local` cannot connect and
 * `resetStore` threw before a single screenshot was taken, which made
 * `capture-screens.ts` unrunnable here. That is how an ad-hoc second capture
 * script got written once already; T001 says not to write another one, so the
 * harness absorbs the condition instead.
 *
 * TOLERATED ONLY FOR A REFUSED CONNECTION, and never silently. An unreachable
 * store means there is no store; any other failure - a bad credential, a wrong
 * bucket policy, a malformed argument - is a real defect and still throws. CI
 * runs MinIO, so this branch does not fire there and cannot hide a break.
 *
 * What the caller gets is a run with no media. For a capture that is honest and
 * already the case: 012/R3 found every image rendering as the same grey box
 * here precisely because the bytes are unreachable. It is NOT evidence that the
 * product's media works, and nothing downstream may read it that way.
 */
function ensureBucket(): void {
  try {
    run('s3:create-local');
  } catch (err) {
    const output = `${(err as { stdout?: Buffer }).stdout ?? ''}${(err as { stderr?: Buffer }).stderr ?? ''}${String(err)}`;
    if (!output.includes('ECONNREFUSED') && !output.includes('ENOTFOUND')) throw err;
    console.warn(
      '\n  ! NO OBJECT STORE. `s3:create-local` could not connect, so this run has no media.\n' +
        '    Expected in the cloud sandbox (MinIO is on quay.io, which egress blocks).\n' +
        '    Every image will be a blank frame. That is the ENVIRONMENT, not the product,\n' +
        '    and it is not evidence either way about whether media loads on a device.\n',
    );
  }
}

export function resetStore(): void {
  run('db:create-local-pg', ['--recreate']);
  ensureBucket();
  run('seed:catalogue');
}
