import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync, readFileSync, existsSync, unlinkSync, openSync, readFileSync as read } from 'node:fs';
import { tmpdir } from 'node:os';
import { ensureJwtSecret } from './secret';

/**
 * T007. Boots the API as a REAL child process under tsx - the production runner.
 *
 * Not `NestFactory.create` in-process. Feature 001 shipped controllers that passed
 * every ts-jest suite and returned 500 in production, because ts-jest emits
 * `design:paramtypes` and esbuild does not. An in-process fixture would reproduce
 * that blind spot exactly.
 *
 * The child is detached into its own process group and its pid recorded on disk,
 * because jest's globalSetup and globalTeardown do not share module state - an
 * in-memory handle is unreachable by the time teardown runs, which leaves the API
 * alive, jest hanging on an open handle, and the port bound for the next run.
 *
 * Its stdio goes to a FILE, not to pipes. Piped stdio keeps jest alive after the
 * run, and destroying the pipes to release it kills the child with EPIPE the next
 * time Nest logs a request - which presents as an ECONNRESET midway through the
 * suite rather than as anything resembling its cause.
 */
const REPO_ROOT = resolve(__dirname, '../../..');
const PID_FILE = resolve(tmpdir(), 'sih-e2e-api.pid');
export const API_LOG = resolve(tmpdir(), 'sih-e2e-api.log');

export async function startApi(port = 3111): Promise<string> {
  await stopApi(); // never inherit a previous run's process on this port

  writeFileSync(API_LOG, '');
  const logFd = openSync(API_LOG, 'a');
  const child = spawn('npx', ['tsx', 'src/main.ts'], {
    cwd: resolve(REPO_ROOT, 'apps/api'),
    env: {
      ...process.env,
      API_PORT: String(port),
      RUNTIME_PROFILE: 'local',
      // Explicit: the API refuses to boot without it, and refuses the published
      // development value outright (003/FR-007).
      LOCAL_JWT_SECRET: ensureJwtSecret(),
    },
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });

  let exited = false;
  child.on('exit', () => {
    exited = true;
  });

  writeFileSync(PID_FILE, String(child.pid));
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    if (exited) throw new Error(`API exited before becoming ready.\n${apiLog()}`);
    try {
      const res = await fetch(`${baseUrl}/v1/health`);
      if (res.ok) {
        child.unref();
        return baseUrl;
      }
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  await stopApi();
  throw new Error(`API did not become ready within 90s.\n${apiLog()}`);
}

/**
 * Kills the API the way a crash does: SIGKILL, no chance to finish anything.
 *
 * `stopApi` sends SIGTERM first, which lets Nest run its shutdown hooks - and a
 * durability test that lets the process tidy up proves only that an orderly
 * shutdown is orderly. The question is what survives when it is not.
 */
export async function killApi(): Promise<void> {
  if (!existsSync(PID_FILE)) return;
  const pid = Number(readFileSync(PID_FILE, 'utf8').trim());
  unlinkSync(PID_FILE);
  if (!Number.isFinite(pid)) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
  for (let i = 0; i < 40; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** The API's own output, for when a journey fails and the cause is server-side. */
export function apiLog(): string {
  return existsSync(API_LOG) ? read(API_LOG, 'utf8') : '(no api log)';
}

export async function stopApi(): Promise<void> {
  if (!existsSync(PID_FILE)) return;
  const pid = Number(readFileSync(PID_FILE, 'utf8').trim());
  unlinkSync(PID_FILE);
  if (!Number.isFinite(pid)) return;
  try {
    process.kill(-pid, 'SIGTERM'); // the whole group: npx spawns tsx spawns node
  } catch {
    /* already gone */
  }
  for (let i = 0; i < 40; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      return; // reaped
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
}
