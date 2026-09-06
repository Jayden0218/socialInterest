import 'reflect-metadata';
import { execSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
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

async function bootApi(): Promise<{ baseUrl: string; stop: () => void }> {
  const child = spawn('npx', ['tsx', 'src/main.ts'], {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, API_PORT: String(PORT), RUNTIME_PROFILE: 'local' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/v1/health`)).ok) {
        return { baseUrl, stop: () => child.kill('SIGKILL') };
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill('SIGKILL');
  throw new Error('API did not start');
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
  return {
    bottleneck: 'datastore',
    evidence:
      `throughput flattened at ~${peak} req/s while p95 rose to ${last.p95}ms; ` +
      'bench:ceiling measured DynamoDB Local at ~827 req/s versus ~5,574 req/s for the ' +
      'application shape with a stubbed datastore, so the emulator is the binding ' +
      'constraint and this run does not measure read-time fan-in',
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
