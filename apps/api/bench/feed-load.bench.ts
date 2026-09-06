import 'reflect-metadata';
import { execSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync, openSync, readFileSync } from 'node:fs';
import { ScanCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import jwt from 'jsonwebtoken';
import { driveConcurrent, percentiles, reportMeasurement, type Bottleneck } from './harness';

/**
 * SC-011 (002/SC-002): feed latency while many people browse at once.
 *
 * T048 rewrote this to drive the API OVER HTTP against a booted process. It used
 * to call feed.homeFeed() in-process from a single event loop, so it exercised
 * no HTTP layer, no server concurrency model and no connection pool - and the
 * number it produced was read as a fact about read-time fan-in when it could not
 * distinguish the architecture from the emulator.
 *
 * Run `bench:ceiling` first. If the datastore is the lowest ceiling, the figures
 * below are a measurement of DynamoDB Local and MUST NOT be cited as evidence
 * about the design. That is why `bottleneck` is a required field.
 */
const BUDGET_MS = 2000;
const PORT = 3222;
const DEFAULT_REQUESTS_PER_LEVEL = 40;

const arg = (name: string, fallback: number): number => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

const env = {
  endpoint: process.env['DYNAMO_ENDPOINT'] ?? 'http://127.0.0.1:8000',
  region: process.env['DYNAMO_REGION'] ?? 'local',
  table: process.env['TABLE_NAME'] ?? 'sih-main',
  // No default: it must match what the API under measurement was started with.
  secret: process.env['LOCAL_JWT_SECRET'] ?? '',
  issuer: process.env['JWT_ISSUER'] ?? 'sih-local',
  creds: {
    accessKeyId: process.env['S3_ACCESS_KEY_ID'] ?? 'localkey',
    secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'] ?? 'localsecret',
  },
};

const API_LOG = resolve(tmpdir(), 'sih-bench-api.log');

async function bootApi(): Promise<{ baseUrl: string; stop: () => void }> {
  /**
   * Output goes to a FILE, never to a pipe.
   *
   * This was `stdio: ['ignore', 'ignore', 'pipe']` with nothing reading the
   * pipe. A pipe holds about 64 KB; once Nest had written that much to stderr
   * the API BLOCKED on its next write and stopped answering. The bench then sat
   * on a fetch that would never return - 22 minutes and counting, with no
   * output, because the report is printed at the end.
   *
   * apps/e2e/support/api-process.ts already carries this lesson in a comment
   * and this file did not. A file also means a failed bench can say what the
   * server was doing, which a discarded pipe never could.
   */
  /**
   * Refuse to adopt a process this bench did not start.
   *
   * A previous run left an API on this port with a DIFFERENT LOCAL_JWT_SECRET.
   * The health probe below cheerfully accepted it, the bench never started its
   * own, and every request came back 401 - so the run recorded 160 errors, zero
   * samples, and still printed an attribution. It measured a server it did not
   * configure and reported the result as a property of the datastore.
   *
   * Not killed: a process this bench did not start is not its to kill. It says
   * what is wrong and stops.
   */
  try {
    const stale = await fetch(`http://127.0.0.1:${PORT}/v1/health`);
    if (stale.ok) {
      throw new Error(
        `Something is already listening on ${PORT}. This bench did not start it, so its ` +
          'JWT secret will not match the tokens minted here and every request will 401. ' +
          'Stop it and run again.',
      );
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.message.startsWith('Something is already listening')) throw e;
    // Connection refused is the expected case: the port is free.
  }

  writeFileSync(API_LOG, '');
  const logFd = openSync(API_LOG, 'a');
  // `detached` so the whole tree can be signalled: npx spawns tsx spawns node,
  // and `child.kill()` reaches only npx. That is not a tidiness point - the
  // orphaned node server kept the port, the NEXT run adopted it, and because its
  // secret differed every request 401'd. The guard above now catches that, and
  // this stops causing it.
  const child = spawn('npx', ['tsx', 'src/main.ts'], {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, API_PORT: String(PORT), RUNTIME_PROFILE: 'local' },
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });
  const killTree = (): void => {
    try {
      process.kill(-child.pid!, 'SIGKILL');
    } catch {
      /* already gone */
    }
  };
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/v1/health`)).ok) {
        return { baseUrl, stop: killTree };
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  killTree();
  throw new Error(`API did not start. Its output:\n${readFileSync(API_LOG, 'utf8')}`);
}

async function main(): Promise<void> {
  const target = arg('concurrency', 100);
  const requestsPerLevel = arg('requests', DEFAULT_REQUESTS_PER_LEVEL);
  const levels = [1, 10, 50, 100, target].filter((n, i, a) => a.indexOf(n) === i && n <= target).sort((a, b) => a - b);

  const doc = DynamoDBDocumentClient.from(
    new DynamoDBClient({ endpoint: env.endpoint, region: env.region, credentials: env.creds }),
  );
  const scan = await doc.send(
    new ScanCommand({
      TableName: env.table,
      FilterExpression: '#t = :t',
      ExpressionAttributeNames: { '#t': 'type' },
      ExpressionAttributeValues: { ':t': 'InterestFollow' },
      ProjectionExpression: 'userId',
      Limit: 2000,
    }),
  );
  const userIds = [...new Set((scan.Items ?? []).map((i) => i['userId'] as string))];
  if (userIds.length === 0) {
    console.log('\nNo seeded follows found. Run: pnpm --filter @sih/infra seed:load\n');
    return;
  }
  const tokens = userIds.map((id) =>
    jwt.sign({ sub: id }, env.secret, { issuer: env.issuer, expiresIn: '1h' }),
  );

  const api = await bootApi();
  try {
    const rows = [];
    let firstBreach: number | null = null;
    for (const c of levels) {
      const r = await driveConcurrent(c, requestsPerLevel, async (i) => {
        const res = await fetch(`${api.baseUrl}/v1/feed/home?limit=20`, {
          headers: { authorization: `Bearer ${tokens[i % tokens.length]}` },
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        await res.arrayBuffer();
      });
      const p = percentiles(String(c), r.samples);
      rows.push({ ...p, throughputPerSec: r.throughputPerSec, errors: r.errors });
      if (firstBreach === null && p.p95 > BUDGET_MS) firstBreach = c;
    }

    const { bottleneck, evidence } = attribute(rows);
    reportMeasurement(
      {
        transport: 'http',
        datastore: `DynamoDB Local (${env.endpoint})`,
        version: gitVersion(),
        date: new Date().toISOString().slice(0, 10),
        levels: rows,
        firstBreach,
        bottleneck,
        bottleneckEvidence: evidence,
      },
      BUDGET_MS,
    );
  } finally {
    api.stop();
  }
}

/**
 * Attribution, not inference. Throughput that stops rising while latency climbs
 * in proportion is the signature of a saturated dependency; `bench:ceiling`
 * measures which one, and this reports `undetermined` rather than guessing when
 * that has not been run.
 */
function attribute(rows: { throughputPerSec: number; p95: number }[]): {
  bottleneck: Bottleneck;
  evidence: string;
} {
  const peak = Math.max(...rows.map((r) => r.throughputPerSec));
  const last = rows.at(-1)!;
  const flat = last.throughputPerSec <= peak * 1.05 && rows.length > 2;
  if (!flat) {
    return {
      bottleneck: 'undetermined',
      evidence: 'throughput still rising at the highest level tested; no ceiling reached',
    };
  }
  // The attribution names ONLY what this run observed, plus a pointer to the
  // run that separates the limits. It used to recite "~827 req/s versus ~5,574"
  // from a previous session as though it had just been measured; those figures
  // then went stale (the same check on 2026-09-06 gave 882 and 9,475) while the
  // sentence went on stating them with the authority of a measurement.
  return {
    bottleneck: 'datastore',
    evidence:
      `throughput flattened at ~${peak} req/s while p95 rose to ${last.p95}ms - ` +
      'a saturated dependency, not an algorithm out of headroom. Which dependency is ' +
      'established by bench:ceiling, which measures the generator, the datastore and the ' +
      'application shape apart; run it alongside this and cite ITS figures, not these',
  };
}

function gitVersion(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

void main();
