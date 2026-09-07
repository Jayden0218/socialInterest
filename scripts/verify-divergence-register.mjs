#!/usr/bin/env node
/**
 * Checks docs/verification/divergence-register.md is honest.
 *
 * Two failure modes it exists to catch, both of which have happened on this
 * project in one form or another:
 *
 *  1. An entry that claims `Verified | yes` with no run record naming it. That is
 *     exactly the "bench written" -> "criterion measured" slip docs/verification
 *     was split in two to prevent.
 *  2. An entry missing the field that makes it useful - what a green local suite
 *     does NOT prove. An entry without that is a note, not a register.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const REGISTER = 'docs/verification/divergence-register.md';
const RUNS = 'docs/verification/runs';

const REQUIRED = [
  'Introduced by',
  'Local implementation',
  'What a hosted deployment would do instead',
  'What a green local suite does NOT prove',
  'Plan to verify the production path',
  'Verified',
];

if (!existsSync(REGISTER)) {
  console.error(`missing ${REGISTER}`);
  process.exit(1);
}

const text = readFileSync(REGISTER, 'utf8');
const entries = text.split(/^## /m).filter((s) => /^D-\d/.test(s));
const runs = existsSync(RUNS) ? readdirSync(RUNS).join('\n') : '';

let failed = 0;
if (entries.length === 0) {
  console.error('no divergence entries found - a register with no entries needs deleting, not passing');
  failed++;
}

for (const entry of entries) {
  const id = entry.split('\n')[0].trim();
  for (const field of REQUIRED) {
    if (!entry.includes(`**${field}**`)) {
      console.error(`${id}: missing required field "${field}"`);
      failed++;
    }
  }
  const verified = /\*\*Verified\*\*\s*\|\s*\*{0,2}(yes|no)/i.exec(entry)?.[1]?.toLowerCase();
  if (!verified) {
    console.error(`${id}: Verified must be exactly yes or no`);
    failed++;
  } else if (verified === 'yes' && !runs.includes(id.split(' ')[0])) {
    console.error(`${id}: claims Verified=yes but no run record in ${RUNS}/ names it`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\ndivergence register: ${failed} problem(s)`);
  process.exit(1);
}
console.log(`divergence register: ${entries.length} entry/entries, all fields present, no unbacked verification claim`);
