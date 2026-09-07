import 'reflect-metadata';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { openSync, readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { percentiles, report } from './harness';

/**
 * 004/T135. What long-polled chat costs the SERVER.
 *
 * WHAT THIS CAN AND CANNOT SAY, stated first because the last bench in this
 * repository was read as evidence about a design decision when it had measured
 * the emulator:
 *
 *   CAN: how many concurrent HELD connections one API process sustains, and
 *   what delivery latency looks like while they are held. That is a property of
 *   the server's connection handling and event bus - not of the datastore -
 *   because a held poll does no datastore work while it waits.
 *
 *   CANNOT: anything about a hosted deployment. Long-poll is registered as a
 *   Constitution V divergence (D-004-1): a managed edge terminates idle
 *   connections, a balancer bounds them, and horizontal scaling puts the waiter
 *   and the writer in different processes. A good number here is not evidence
 *   that hosted chat works.
 *
 *   CANNOT: 002/SC-002. That needs a provisioned datastore and the owner's
 *   approval to spend.
 *
 * Usage: pnpm --filter @sih/api bench:chat [--holders=100]
 */
const PORT = 3223;
const BUDGET_MS = 2000;

const arg = (name: string, fallback: number): number => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

const secret = process.env['LOCAL_JWT_SECRET'] ?? '';
const issuer = process.env['JWT_ISSUER'] ?? 'sih-local';
const audience = process.env['JWT_AUDIENCE'] ?? 'sih-api';

function token(userId: string): string {
  if (!secret) throw new Error('LOCAL_JWT_SECRET must match the API under measurement');
  return jwt.sign({ sub: userId }, secret, { issuer, audience, expiresIn: '2h' });
}

async function bootApi(): Promise<{ baseUrl: string; stop: () => void }> {
  // A FILE, never a pipe. Nothing reads a pipe here, and once Nest has written
  // ~64KB to it the API blocks on its next write and stops answering - which
  // cost 22 minutes of a previous bench run with no output at all.
  const logPath = resolve(tmpdir(), `sih-chat-bench-${Date.now()}.log`);
  const logFd = openSync(logPath, 'a');
  const child = spawn('npx', ['tsx', 'src/main.ts'], {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, API_PORT: String(PORT), RUNTIME_PROFILE: 'local' },
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });
  // The whole GROUP: killing `npx` leaves the node process it spawned holding
  // the port, and the next run then measures an orphan.
  const stop = (): void => {
    try {
      process.kill(-child.pid!, 'SIGKILL');
    } catch {
      /* already gone */
    }
  };

  const baseUrl = `http://127.0.0.1:${PORT}`;
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      const res = await fetch(`${baseUrl}/v1/health`);
      if (res.ok) return { baseUrl, stop };
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      stop();
      throw new Error(`API did not start. Log:\n${readFileSync(logPath, 'utf8').slice(-4000)}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function main(): Promise<void> {
  const holders = arg('holders', 100);
  const { baseUrl, stop } = await bootApi();

  try {
    const api = async (path: string, opts: RequestInit = {}, as?: string): Promise<Response> =>
      fetch(`${baseUrl}/v1${path}`, {
        ...opts,
        headers: {
          'content-type': 'application/json',
          ...(as ? { authorization: `Bearer ${token(as)}` } : {}),
          ...(opts.headers ?? {}),
        },
      });

    /**
     * A SIGNED TOKEN IS NOT AN IDENTITY.
     *
     * The local profile has no signup endpoint, so a correctly signed JWT whose
     * profile row does not exist gets 404 from every endpoint that resolves a
     * person. This is written down in CLAUDE.md from the device runs and it
     * caught this bench too - seed through the API's OWN repository, the same
     * thing mint-device-token.ts and apps/e2e/support/people.ts do.
     */
    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
    const { PersonRepository } = await import('../src/persistence/person.repository');
    const doc = DynamoDBDocumentClient.from(
      new DynamoDBClient({
        endpoint: process.env['DYNAMO_ENDPOINT'] ?? 'http://127.0.0.1:8000',
        region: process.env['DYNAMO_REGION'] ?? 'local',
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      }),
      { marshallOptions: { removeUndefinedValues: true } },
    );
    const people = new PersonRepository(doc, process.env['TABLE_NAME'] ?? 'sih-main');
    const seed = async (userId: string, handle: string): Promise<string> => {
      await people.create({
        userId,
        handle,
        displayName: handle,
        followerCount: 0,
        followingCount: 0,
        interestFollowCount: 0,
        notificationPrefs: { reaction: true, comment: true, follow: true, message: true },
        status: 'active',
        createdAt: new Date().toISOString(),
      });
      return handle;
    };

    // One conversation per holder, so each held poll waits on a different
    // partition - measuring the server rather than one hot key.
    const run = Date.now().toString(36);
    const pairs: { a: string; b: string; conversationId: string }[] = [];
    for (let i = 0; i < holders; i++) {
      const a = `bench-a-${i}-${run}`;
      const b = `bench-b-${i}-${run}`;
      const handleB = await seed(b, `benchb${i}${run}`);
      await seed(a, `bencha${i}${run}`);
      const opened = await api(`/conversations/with/${handleB}`, { method: 'PUT' }, a);
      if (!opened.ok) continue;
      const conv = (await opened.json()) as { conversationId: string };
      pairs.push({ a, b, conversationId: conv.conversationId });
    }

    if (pairs.length === 0) {
      // Honest failure. A bench that reports zeros because its fixture never
      // built is worse than one that says so - this project has printed a table
      // of zeros with a confident attribution before.
      throw new Error(
        'no conversations could be opened; the bench measured nothing. ' +
          'Check that people exist for the minted tokens (the local profile has no signup).',
      );
    }

    // Hold every poll open at once.
    const held = pairs.map((p) =>
      api(`/conversations/${p.conversationId}/messages?wait=20`, {}, p.a).catch(() => null),
    );
    await new Promise((r) => setTimeout(r, 2000));

    // Now deliver into each, and measure how long the held poll takes to wake.
    const latencies: number[] = [];
    for (const p of pairs.slice(0, Math.min(pairs.length, 25))) {
      const started = Date.now();
      await api(
        `/conversations/${p.conversationId}/messages`,
        { method: 'POST', body: JSON.stringify({ body: 'bench' }) },
        p.a,
      );
      const res = await api(`/conversations/${p.conversationId}/messages?wait=20`, {}, p.b);
      await res.json();
      latencies.push(Date.now() - started);
    }

    await Promise.all(held);

    const ok = report(
      `chat: ${pairs.length} concurrent held polls on one API process`,
      BUDGET_MS,
      [percentiles('deliver + wake (ms)', latencies)],
    );

    console.log(
      '\nWHAT THIS MEASURES: one API process holding ' +
        `${pairs.length} connections. NOT a hosted deployment - long-poll is a ` +
        'registered Constitution V divergence (D-004-1), and NOT 002/SC-002, ' +
        'which needs a provisioned datastore and approval to spend.\n',
    );
    if (!ok) process.exitCode = 1;
  } finally {
    stop();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
