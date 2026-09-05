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
