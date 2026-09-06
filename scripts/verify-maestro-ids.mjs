/**
 * Every `id:` a Maestro flow selects on must exist in the app as built.
 *
 * Six of these were wrong when the flows were first written, and a Maestro
 * selector that matches nothing does not fail loudly at authoring time - it
 * fails during a 25-minute CI run, as a timeout, with no indication that the
 * selector was the problem rather than the app.
 *
 * This runs in seconds and does not need a device, so it runs before one is
 * booted. Static, deliberately: it matches testID literals in apps/mobile/src
 * rather than rendering, because the point is to catch a name that no longer
 * exists anywhere, not to re-test the UI.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const SRC = 'apps/mobile/src';
const FLOWS = '.maestro';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (['.tsx', '.ts'].includes(extname(p))) out.push(p);
  }
  return out;
}

// testID="literal", testID={`post-${id}`}, testID={x ? 'a' : 'b'} - collect every
// string literal that appears in a testID position, plus the static prefix of a
// template literal so `post-${id}` is matched by the `post-` prefix rule below.
const source = walk(SRC).map((f) => readFileSync(f, 'utf8')).join('\n');
const known = new Set();
const prefixes = new Set();
for (const m of source.matchAll(/testID=\{?["'`]([^"'`$]*)(\$\{)?/g)) {
  if (m[2]) prefixes.add(m[1]);
  else if (m[1]) known.add(m[1]);
}
// testID={someExpression} with literals inside, e.g. {open ? 'a' : 'b'}
for (const m of source.matchAll(/testID=\{[^}]*\}/g)) {
  for (const lit of m[0].matchAll(/["'`]([A-Za-z0-9_.-]+)["'`]/g)) known.add(lit[1]);
}

const ids = new Set();
for (const file of readdirSync(FLOWS).filter((f) => f.endsWith('.yaml'))) {
  const text = readFileSync(join(FLOWS, file), 'utf8');
  for (const m of text.matchAll(/\bid:\s*"?([A-Za-z0-9_.${}-]+)"?/g)) {
    ids.add(`${file}\t${m[1]}`);
  }
}

const missing = [];
for (const entry of ids) {
  const [file, id] = entry.split('\t');
  // Maestro ids are regexes. `post-.` is a pattern, so match it against the
  // static prefixes the app builds dynamically.
  const bare = id.replace(/[.*+?^${}()|[\]\\]+$/, '');
  const ok =
    known.has(id) ||
    known.has(bare) ||
    [...prefixes].some((p) => id.startsWith(p) || p.startsWith(bare)) ||
    [...known].some((k) => k.startsWith(bare) && bare.length > 3);
  if (!ok) missing.push(`${file}: id "${id}"`);
}

console.log(`checked ${ids.size} selector(s) across ${readdirSync(FLOWS).filter((f) => f.endsWith('.yaml')).length} flow(s)`);
console.log(`app declares ${known.size} testID literal(s) and ${prefixes.size} dynamic prefix(es)`);
if (missing.length) {
  console.error('FAIL: these Maestro selectors match nothing in ' + SRC + ':');
  for (const m of missing) console.error('  ' + m);
  console.error('A selector that matches nothing fails as a timeout, not as a name error.');
  process.exit(1);
}
console.log('OK: every Maestro selector exists in the app.');
