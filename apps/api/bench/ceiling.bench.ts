import 'reflect-metadata';
import { execSync } from 'node:child_process';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { driveConcurrent, percentiles } from './harness';

/**
 * T047. What is actually saturating?
 *
 * Feature 001 reported p95 11.8s at 100 concurrent and read it as a fact about
 * read-time fan-in. It cannot be: that harness ran in-process, on one event loop,
 * against single-process DynamoDB Local. Any of three things could produce a
 * rising curve, and the measurement could not tell them apart.
 *
 * So measure the three ceilings separately, before touching the feed design:
 *
 *   1. GENERATOR  - the load driver itself, against a trivial local endpoint.
 *   2. DATASTORE  - DynamoDB Local alone, no application code.
 *   3. APPLICATION - the API with the datastore replaced by a fixed delay.
 *
 * Whichever is lowest is the ceiling the feed measurement is actually hitting.
 * If it is 1 or 2, the feed number says nothing about the architecture.
 */
const LEVELS = [1, 10, 50, 100];
const REQUESTS = 400;
const STUB_LATENCY_MS = 2;

const endpoint = process.env['DYNAMO_ENDPOINT'] ?? 'http://127.0.0.1:8000';
const region = process.env['DYNAMO_REGION'] ?? 'local';
const table = process.env['TABLE_NAME'] ?? 'sih-main';
const creds = {
  accessKeyId: process.env['S3_ACCESS_KEY_ID'] ?? 'localkey',
  secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'] ?? 'localsecret',
};

async function ceilingOf(
  name: string,
  request: (i: number) => Promise<unknown>,
): Promise<{ name: string; best: number; rows: string[] }> {
  const rows: string[] = [];
  let best = 0;
  for (const c of LEVELS) {
    const r = await driveConcurrent(c, REQUESTS, request);
    const p = percentiles(String(c), r.samples);
    best = Math.max(best, r.throughputPerSec);
    rows.push(
      `  ${name.padEnd(12)}${String(c).padStart(5)}${String(p.p50).padStart(9)}${String(p.p95).padStart(9)}${String(r.throughputPerSec).padStart(9)}${String(r.errors).padStart(8)}`,
    );
  }
  return { name, best, rows };
}

async function main(): Promise<void> {
  console.log('\nCeiling attribution — three limits, measured apart\n');
  console.log(`  ${'subject'.padEnd(12)}${'conc'.padStart(5)}${'p50'.padStart(9)}${'p95'.padStart(9)}${'req/s'.padStart(9)}${'errors'.padStart(8)}`);

  // 1. The generator. A resolved promise plus the await machinery: whatever this
  //    tops out at is the most any other number here could possibly be.
  const generator = await ceilingOf('generator', async () => {
    await new Promise((r) => setImmediate(r));
  });
  generator.rows.forEach((r) => console.log(r));

  // 2. The datastore alone. DescribeTable is a real round trip to DynamoDB Local
  //    with no application code in the path.
  const dynamo = new DynamoDBClient({ endpoint, region, credentials: creds });
  const datastore = await ceilingOf('datastore', () =>
    dynamo.send(new DescribeTableCommand({ TableName: table })),
  );
  datastore.rows.forEach((r) => console.log(r));

  // 3. The application shape with a fixed-latency stand-in for the datastore:
  //    the same fan-in arithmetic, none of the emulator. 200 followed interests
  //    is the cap from research D1.
  const FAN_IN = 200;
  const application = await ceilingOf('application', async () => {
    await Promise.all(
      Array.from({ length: FAN_IN }, () => new Promise((r) => setTimeout(r, STUB_LATENCY_MS))),
    );
  });
  application.rows.forEach((r) => console.log(r));

  const ranked = [generator, datastore, application].sort((a, b) => a.best - b.best);
  const lowest = ranked[0]!;

  console.log('\n  peak throughput by subject (req/s):');
  for (const s of [generator, datastore, application]) {
    console.log(`    ${s.name.padEnd(12)} ${String(s.best).padStart(6)}`);
  }
  console.log(`\n  lowest ceiling: ${lowest.name} at ${lowest.best} req/s`);
  console.log(
    lowest.name === 'datastore'
      ? '\n  The emulator is the binding constraint. A feed measurement taken against\n' +
          '  it is a measurement OF IT, and says nothing about read-time fan-in.\n' +
          '  Re-measure against provisioned DynamoDB (T052, gated) before drawing\n' +
          '  any conclusion about the architecture.\n'
      : lowest.name === 'generator'
        ? '\n  The load driver is the binding constraint. Every other figure here is\n' +
            '  bounded by it and none of them are attributable. Fix the driver first.\n'
        : '\n  The application is the binding constraint - the fan-in arithmetic, not\n' +
            '  the emulator. This is the case in which the D1 hybrid is warranted.\n',
  );

  console.log(`  environment: node ${process.version}, ${cpuInfo()}`);
}

function cpuInfo(): string {
  try {
    const n = execSync('nproc', { encoding: 'utf8' }).trim();
    return `${n} cpu`;
  } catch {
    return 'unknown cpu';
  }
}

void main();
