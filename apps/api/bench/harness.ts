export interface Sample {
  label: string;
  durationMs: number;
}

export interface Percentiles {
  label: string;
  n: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export function percentiles(label: string, samples: number[]): Percentiles {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return {
    label,
    n: sorted.length,
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    p99: round(at(0.99)),
    max: round(sorted.at(-1) ?? 0),
  };
}

const round = (n: number): number => Math.round(n * 10) / 10;

export async function timed<T>(fn: () => Promise<T>): Promise<number> {
  const started = process.hrtime.bigint();
  await fn();
  return Number(process.hrtime.bigint() - started) / 1e6;
}

export function report(title: string, budgetMs: number, rows: Percentiles[]): boolean {
  console.log(`\n${title}  (budget: p95 <= ${budgetMs}ms)\n`);
  console.log(`  ${'case'.padEnd(28)}${'n'.padStart(6)}${'p50'.padStart(9)}${'p95'.padStart(9)}${'p99'.padStart(9)}${'max'.padStart(9)}`);
  let worst = 0;
  for (const r of rows) {
    worst = Math.max(worst, r.p95);
    const flag = r.p95 > budgetMs ? '  OVER BUDGET' : '';
    console.log(
      `  ${r.label.padEnd(28)}${String(r.n).padStart(6)}${String(r.p50).padStart(9)}${String(r.p95).padStart(9)}${String(r.p99).padStart(9)}${String(r.max).padStart(9)}${flag}`,
    );
  }
  const ok = worst <= budgetMs;
  console.log(`\n  worst p95: ${round(worst)}ms — ${ok ? 'within budget' : 'OVER BUDGET'}\n`);
  return ok;
}

/* ------------------------------------------------------------------ *
 * T046. Concurrency that is actually concurrent.
 *
 * The original feed-load bench issued its load as `Promise.all` from one Node
 * event loop, which interleaves continuations on a single core. That measures
 * how well one process multiplexes, not how the system behaves with N callers,
 * and it cannot saturate anything that is not the loop itself. Every figure it
 * produced was therefore unattributable - which is the whole finding of R1.
 *
 * `driveConcurrent` keeps exactly `concurrency` requests in flight for the whole
 * run, and records how long the run took so throughput can be derived. It is
 * still one process; `bench:ceiling` is what establishes whether that process is
 * the limit.
 * ------------------------------------------------------------------ */

export interface LoadResult {
  concurrency: number;
  samples: number[];
  errors: number;
  wallMs: number;
  throughputPerSec: number;
}

export async function driveConcurrent(
  concurrency: number,
  totalRequests: number,
  request: (i: number) => Promise<unknown>,
): Promise<LoadResult> {
  const samples: number[] = [];
  let issued = 0;
  let errors = 0;
  const started = process.hrtime.bigint();

  // Each worker pulls the next index as it finishes, so exactly `concurrency`
  // requests are in flight throughout - not `concurrency` bursts with idle gaps.
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = issued++;
      if (i >= totalRequests) return;
      const t0 = process.hrtime.bigint();
      try {
        await request(i);
        samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
      } catch {
        errors++;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  const wallMs = Number(process.hrtime.bigint() - started) / 1e6;
  return {
    concurrency,
    samples,
    errors,
    wallMs,
    throughputPerSec: wallMs > 0 ? Math.round((samples.length / wallMs) * 1000) : 0,
  };
}

export type Bottleneck = 'generator' | 'application' | 'datastore' | 'undetermined';

export interface LoadMeasurement {
  transport: 'http' | 'in-process';
  datastore: string;
  version: string;
  date: string;
  levels: (Percentiles & { throughputPerSec: number; errors: number })[];
  firstBreach: number | null;
  bottleneck: Bottleneck;
  bottleneckEvidence: string;
}

/**
 * Datastores that are not the thing they stand for.
 *
 * DynamoDB Local is shipped by Amazon for testing. A number measured against it
 * is a number about it - measured at 827 req/s against an application shape of
 * 5,574, so it is the binding constraint long before the design is.
 *
 * 003/FR-013 exists because 001 reported an emulator's p95 of 11.8s as a
 * property of the read-time feed design, and that reading drove a proposal to
 * build a fan-out hybrid the evidence never warranted.
 */
const STAND_INS = ['dynamodb local', 'dynamodb-local', 'dynamodblocal', 'minio', 'in-memory', 'stub'];

/**
 * Substring, not equality. The benches name their datastore with detail -
 * "DynamoDB Local (http://127.0.0.1:8000)" - and an exact-match check would
 * silently classify that as a production datastore, which is precisely the
 * mistake this guard exists to prevent.
 */
const isStandIn = (name: string): boolean => {
  const n = name.trim().toLowerCase();
  return STAND_INS.some((s) => n.includes(s));
};

/**
 * Prints the Load Measurement shape from data-model.md.
 *
 * `transport`, `datastore` and `bottleneck` are required, and required at
 * RUNTIME rather than only in the type: feature 001's headline figure was taken
 * in-process against an emulator and read as though it were neither. A
 * measurement that cannot say what it measured is not a weaker measurement, it
 * is a misleading one, so this refuses to print it at all (003/T044).
 */
export function reportMeasurement(m: LoadMeasurement, budgetMs: number): void {
  const missing = (['transport', 'datastore', 'version', 'bottleneck'] as const).filter(
    (k) => typeof m[k] !== 'string' || m[k].trim() === '',
  );
  if (missing.length > 0) {
    throw new Error(
      `Load Measurement is missing ${missing.join(', ')}. These have no default: a ` +
        'figure that cannot say what it measured gets cited as though it measured ' +
        'the design. Name the datastore exactly (e.g. "dynamodb-local").',
    );
  }
  /**
   * A run in which nothing succeeded is not a slow run, it is not a run.
   *
   * A feed-load bench once recorded 160 errors and zero samples - every request
   * 401'd against a stale server on the port - and printed p50/p95/p99 of 0 with
   * `bottleneck: datastore` underneath, because the attribution was derived from
   * figures baked into the code rather than from what had just been measured.
   * Zeros read as "fast".
   */
  const observed = m.levels.reduce((n, l) => n + l.n, 0);
  const failed = m.levels.reduce((n, l) => n + l.errors, 0);
  if (observed === 0) {
    throw new Error(
      `Every request failed (${failed} errors, 0 successful). There is nothing here to ` +
        'measure. Fix the run before reporting it - a table of zeros reads as a fast system.',
    );
  }
  if (failed > observed) {
    throw new Error(
      `More requests failed (${failed}) than succeeded (${observed}). A measurement taken ` +
        'from the minority that got through is not a measurement of the system.',
    );
  }

  if (m.bottleneck !== 'undetermined' && m.bottleneckEvidence.trim() === '') {
    throw new Error(
      `bottleneck is "${m.bottleneck}" with no evidence. An attribution without ` +
        'evidence is a guess wearing a field name.',
    );
  }

  console.log(`\nLoad Measurement — transport: ${m.transport}, datastore: ${m.datastore}`);
  console.log(`version ${m.version}  ${m.date}   (budget: p95 <= ${budgetMs}ms)\n`);
  console.log(
    `  ${'concurrency'.padEnd(14)}${'n'.padStart(6)}${'p50'.padStart(9)}${'p95'.padStart(9)}${'p99'.padStart(9)}${'req/s'.padStart(9)}${'errors'.padStart(8)}`,
  );
  for (const l of m.levels) {
    const flag = l.p95 > budgetMs ? '  OVER BUDGET' : '';
    console.log(
      `  ${l.label.padEnd(14)}${String(l.n).padStart(6)}${String(l.p50).padStart(9)}${String(l.p95).padStart(9)}${String(l.p99).padStart(9)}${String(l.throughputPerSec).padStart(9)}${String(l.errors).padStart(8)}${flag}`,
    );
  }
  console.log(`\n  first breach of ${budgetMs}ms p95: ${m.firstBreach ?? 'none at the levels tested'}`);
  console.log(`  bottleneck: ${m.bottleneck}`);
  console.log(`  evidence:   ${m.bottleneckEvidence}`);
  if (m.bottleneck === 'undetermined') {
    console.log('\n  NOT EVIDENCE ABOUT THE DESIGN. An unattributed breach says only');
    console.log('  that something is the limit, not what. Run bench:ceiling first.\n');
  } else {
    console.log('');
  }

  // 003/T047. Printed last so it is the thing left on screen, and printed even
  // when the run looks healthy - a comfortable number measured against a
  // stand-in is just as misleading as an uncomfortable one.
  if (isStandIn(m.datastore)) {
    console.log(`  ${'='.repeat(68)}`);
    console.log(`  THIS MEASURES ${m.datastore.toUpperCase()}, NOT A PRODUCTION DATASTORE.`);
    console.log('  Report it as a measurement of the stand-in. It is not a statement');
    console.log('  about the product, the design, or what either would do in service');
    console.log('  (003/FR-013). Closing 002/SC-002 needs a provisioned datastore, and');
    console.log("  that needs the owner's explicit approval to spend.");
    console.log(`  ${'='.repeat(68)}\n`);
  }
}
