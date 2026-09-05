/**
 * T070. What a verification actually cost, against what was approved.
 *
 * Recorded for every run including the ones that cost nothing - a missing figure
 * and a zero are different things, and only one of them is evidence.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const APPROVALS = resolve(ROOT, 'docs/verification/approvals.md');

const runArg = process.argv.find((a) => a.startsWith('--run='));
const runId = runArg?.split('=')[1];

function approvedCeiling(): { id: string; ceiling: string } | null {
  if (!existsSync(APPROVALS)) return null;
  const text = readFileSync(APPROVALS, 'utf8');
  const row = text.split('\n').find((l) => /^\|\s*A-\d+\s*\|/.test(l));
  if (!row) return null;
  const cells = row.split('|').map((c) => c.trim());
  return { id: cells[1] ?? '', ceiling: cells[3] ?? '' };
}

function main(): void {
  const approval = approvedCeiling();

  if (!approval) {
    console.log('spend-report: no approval on record, so no verification has run.');
    console.log('  Approved spend:  none');
    console.log('  Actual spend:    0 (nothing was provisioned)');
    console.log('\n  Per the constitution, approval for one piece of work is not approval');
    console.log('  for the next. Every gated task remains unstarted.');
    return;
  }

  console.log(`spend-report for ${runId ?? 'all runs'}`);
  console.log(`  approval:  ${approval.id}`);
  console.log(`  ceiling:   ${approval.ceiling}`);
  console.log('  actual:    read from the cost explorer for the run tag and record it');
  console.log('             in the Verification Run before this run is considered complete.');
}

main();
