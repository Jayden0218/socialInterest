/**
 * Guards the stack description against the data model.
 *
 * The GSIs in infra/lib/infra-stack.ts must match what create-local-table.ts
 * builds, or the local profile and production would disagree about the shape of
 * the table - and every access pattern in data-model.md would work locally while
 * failing in production. Cheap to check, expensive to discover.
 */
import { stack } from '../lib/infra-stack';

const EXPECTED_INDEXES = ['gsi1', 'gsi2', 'gsi3', 'gsi4'];

const problems: string[] = [];

const names = stack.table.indexes.map((i) => i.name);
for (const expected of EXPECTED_INDEXES) {
  if (!names.includes(expected)) problems.push(`missing index ${expected}`);
}
for (const index of stack.table.indexes) {
  if (index.partitionKey !== `${index.name}pk` || index.sortKey !== `${index.name}sk`) {
    problems.push(`${index.name} keys do not follow the <name>pk/<name>sk convention`);
  }
}
if (stack.table.partitionKey !== 'pk' || stack.table.sortKey !== 'sk') {
  problems.push('table keys must be pk/sk to match data-model.md');
}
if (!stack.table.ttlAttribute) problems.push('ttl attribute is required for notifications (A20)');
if (stack.table.stream !== 'NEW_AND_OLD_IMAGES') {
  problems.push('the catalogue cache and analytics export both need the stream');
}

if (problems.length > 0) {
  console.error('stack description does not match data-model.md:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`stack description matches data-model.md (${names.length} GSIs, ttl, stream)`);
