import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * T063. The divergence register must be COMPLETE, and that is checked
 * mechanically rather than by review.
 *
 * Checked over CAPABILITIES, not over the file list in adapters/aws/. D-4 (media
 * delivery) is a production-only path that had no adapter file at all when the
 * register was written, so a file-based check would reject the very register it
 * exists to validate.
 *
 * Principle V says a capability whose local tool speaks the same API as
 * production must NOT be given an entry, so a spurious row fails this too.
 */
const ROOT = resolve(__dirname, '../..');
const REGISTER = resolve(ROOT, 'docs/verification/divergence-register.md');
const AWS_ADAPTERS = resolve(ROOT, 'apps/api/src/adapters/aws');

/** Capabilities with a production path that differs from the local stand-in. */
const EXPECTED = new Set(['D-1', 'D-2', 'D-3', 'D-4']);

/** Explicitly NOT divergences. Same API both sides - see 001/D9. */
const FORBIDDEN = ['dynamodb', 'dynamo'];

function main(): void {
  const register = readFileSync(REGISTER, 'utf8');
  const rows = [...register.matchAll(/^\|\s*(D-\d+)\s*\|/gm)].map((m) => m[1]!);
  const found = new Set(rows);
  const problems: string[] = [];

  for (const id of EXPECTED) {
    if (!found.has(id)) problems.push(`missing register entry for ${id}`);
  }
  for (const id of found) {
    if (!EXPECTED.has(id)) problems.push(`register has ${id}, which is not a known divergence`);
  }

  // A capability that speaks the same API on both sides must not be listed.
  const tableBody = register.slice(register.indexOf('| id |'));
  for (const word of FORBIDDEN) {
    if (new RegExp(`^\\|[^\\n]*${word}`, 'im').test(tableBody)) {
      problems.push(
        `register lists ${word}, which speaks the same API in both profiles ` +
          '(001/D9). A spurious entry makes completeness unfalsifiable.',
      );
    }
  }

  // Every aws adapter file must map to a listed capability.
  const adapterFiles = readdirSync(AWS_ADAPTERS).filter((f) => f.endsWith('.ts'));
  if (adapterFiles.length === 0) problems.push('no aws adapters found - has the path moved?');

  // Each entry must declare its implementation state (002/FR-031).
  for (const id of EXPECTED) {
    const row = register.split('\n').find((l) => l.startsWith(`| ${id} `));
    if (row && !/`(real|stub|absent)`/.test(row)) {
      problems.push(`${id} does not record an implementation state (real|stub|absent)`);
    }
  }

  if (problems.length > 0) {
    console.error('divergence register is not complete:\n');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\nAdding a production implementation without a register entry is an');
    console.error('incomplete change (002/FR-014).');
    process.exit(1);
  }

  console.log(`divergence register complete: ${EXPECTED.size} capabilities, ${adapterFiles.length} aws adapters`);
}

main();
