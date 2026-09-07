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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
const files = walk(SRC).map((f) => ({ path: f, text: readFileSync(f, 'utf8') }));
const source = files.map((f) => f.text).join('\n');
const known = new Set();
const prefixes = new Set();
/**
 * Which FILE builds each dynamic prefix, and which string literals that file
 * contains. Together these turn "some suffix, we cannot know which" into a
 * question with an answer for the common case: the suffixes an id is built from
 * are almost always written as literals beside the template that consumes them.
 */
const prefixFiles = new Map();
const literalsByFile = new Map();
const valueImportsByFile = new Map();
for (const { path, text: raw } of files) {
  /**
   * COMMENTS ARE NOT EVIDENCE that a value exists.
   *
   * Found while verifying this check by reintroducing the defect it is for: the
   * reintroduced file still carried a comment explaining that `message` was the
   * fourth category, and that comment alone made `pref-message` resolvable. The
   * check passed against code that could not render the switch. A guard read
   * from prose describes the intention, not the build.
   */
  const text = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const lits = new Set();
  for (const m of text.matchAll(/["'`]([A-Za-z0-9_-]{2,40})["'`]/g)) lits.add(m[1]);
  // A key written bare in an object literal or a type: `{ key: 'message' }` is
  // covered above, but `message: boolean` and `case 'message':` shapes vary, so
  // identifiers used as object keys count too.
  for (const m of text.matchAll(/\b([A-Za-z][A-Za-z0-9_]{1,39})\s*:/g)) lits.add(m[1]);
  literalsByFile.set(path, lits);

  /**
   * VALUE imports only - `import type` is skipped deliberately.
   *
   * A value that ends up inside a template literal has to REACH it, and a
   * type-only import carries nothing at runtime. That distinction is what makes
   * this check work: before the fix, EditProfileScreen imported NotificationPrefs
   * as a type (so `message` was in scope as a name but not as data) and built its
   * switches from a private three-entry list. Counting the type import would have
   * called `pref-message` resolvable and missed the defect all over again.
   */
  const imports = new Set();
  for (const m of text.matchAll(/^import\s+(?!type\s)[^;]*?from\s+['"](\.[^'"]+)['"]/gm)) {
    imports.add(m[1]);
  }
  valueImportsByFile.set(path, imports);
  for (const m of text.matchAll(/testID=\{?["'`]([^"'`$]*)(\$\{)?/g)) {
    if (m[2]) {
      prefixes.add(m[1]);
      if (!prefixFiles.has(m[1])) prefixFiles.set(m[1], new Set());
      prefixFiles.get(m[1]).add(path);
    } else if (m[1]) known.add(m[1]);
  }
}
// testID={someExpression} with literals inside, e.g. {open ? 'a' : 'b'}
for (const m of source.matchAll(/testID=\{[^}]*\}/g)) {
  for (const lit of m[0].matchAll(/["'`]([A-Za-z0-9_.-]+)["'`]/g)) known.add(lit[1]);
}

const ids = new Set();
for (const file of readdirSync(FLOWS).filter((f) => f.endsWith('.yaml'))) {
  const text = readFileSync(join(FLOWS, file), 'utf8');
  // `:` and `/` are in the class so a fully-qualified foreign id survives
  // intact - without them `com.android.documentsui:id/dir_list` was truncated at
  // the colon and then reported as a missing testID, which is a confusing way to
  // be told the check does not understand the value.
  for (const m of text.matchAll(/\bid:\s*"?([A-Za-z0-9_.:/${}-]+)"?/g)) {
    ids.add(`${file}\t${m[1]}`);
  }
}

/**
 * An id belonging to ANOTHER app is not ours to declare.
 *
 * `10-publish-from-library.yaml` asserts on `com.android.documentsui:id/dir_list`
 * to prove the app hands off to the device's own file picker. That id is
 * Android's, so it will never appear in apps/mobile/src, and this check was
 * right to flag it - the answer is to recognise the shape, not to weaken the
 * check. A fully-qualified `package:id/name` is deliberately external; a bare
 * name still has to exist in our source.
 */
const isForeignResourceId = (id) => /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+:id\//.test(id);

/**
 * The files whose literals a given file can actually see: itself, plus every
 * module it imports as a VALUE, one hop.
 *
 * One hop, not transitively: the point is "the list this template maps over is
 * in scope", and that list is imported directly. Following the whole graph would
 * reach every literal in the app and make the check vacuous - which is the state
 * it was in before, waving through any suffix at all.
 */
function scopeOf(file) {
  const out = new Set();
  const dir = file.slice(0, file.lastIndexOf('/'));
  for (const spec of valueImportsByFile.get(file) ?? []) {
    const resolved = normalise(`${dir}/${spec}`);
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
      if (literalsByFile.has(resolved + ext)) out.add(resolved + ext);
    }
  }
  return out;
}

/** `a/b/../c` -> `a/c`; no path module needed for these relative specifiers. */
function normalise(p) {
  const parts = [];
  for (const seg of p.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

const missing = [];
const unresolved = [];
const foreign = [];
for (const entry of ids) {
  const [file, id] = entry.split('\t');
  if (isForeignResourceId(id)) {
    foreign.push(`${file}: ${id}`);
    continue;
  }
  // Maestro ids are regexes. `post-.` is a pattern, so match it against the
  // static prefixes the app builds dynamically.
  const bare = id.replace(/[.*+?^${}()|[\]\\]+$/, '');
  const literal = known.has(id) || known.has(bare) || [...known].some((k) => k.startsWith(bare) && bare.length > 3);
  const matchedPrefixes = [...prefixes].filter((p) => id.startsWith(p) || p.startsWith(bare));
  if (literal) continue;
  if (matchedPrefixes.length === 0) {
    missing.push(`${file}: id "${id}"`);
    continue;
  }

  /**
   * A CONCRETE id under a dynamic prefix is now resolved, not waved through.
   *
   * This is the blind spot that let `media-item-video` pass while no such item
   * existed, and then let `pref-message` pass while EditProfileScreen's private
   * category list had only three entries - so FR-031's toggle did not exist and
   * the flow failed as a timeout twenty minutes into an emulator run. Twice is
   * enough to stop describing it and start checking it.
   *
   * The rule: if the flow's selector is a plain string (not a regex) and it sits
   * under a prefix some file builds, the SUFFIX must appear as a string literal
   * or object key in one of the files that build that prefix. That is where the
   * value comes from in practice - a category list, a tab key, a media kind.
   *
   * A regex selector (`open-conversation-.*`) is exempt: it deliberately means
   * "whichever id the server produced", and no static check can know those.
   * A trailing positional index is stripped, because `media-item-video-1` is
   * `video` plus a list position.
   */
  const isRegex = /[.*+?^$()|[\]\\]/.test(id);
  if (isRegex) continue;
  const resolvable = matchedPrefixes.some((p) => {
    if (!id.startsWith(p)) return false;
    const suffix = id.slice(p.length).replace(/-\d+$/, '');
    // A bare list position: `interest-option-0` is the first option, and no
    // source file will ever contain the literal "0" meaningfully.
    if (suffix === '' || /^\d+$/.test(suffix)) return true;
    return [...(prefixFiles.get(p) ?? [])].some(
      (f) => literalsByFile.get(f)?.has(suffix) || [...scopeOf(f)].some((d) => literalsByFile.get(d)?.has(suffix)),
    );
  });
  if (!resolvable) {
    unresolved.push(
      `${file}: id "${id}" - built from a dynamic testID, but no file that builds it ` +
        `mentions "${id.slice(matchedPrefixes.find((p) => id.startsWith(p))?.length ?? 0).replace(/-\d+$/, '')}"`,
    );
  }
}

/**
 * EVERY ${VAR} A FLOW USES MUST BE PASSED BY THE SCRIPT THAT RUNS IT.
 *
 * Maestro does not fail on an undefined variable - it substitutes the literal
 * text `${GROUP_MEMBER_A}` and then waits thirty seconds for an element with
 * that name. So a flow referencing a variable the runner never passes fails as a
 * TIMEOUT, twenty minutes into a 25-minute emulator run, looking exactly like a
 * broken screen. That is the same failure shape this whole script exists to move
 * from an expensive run to a two-second check, and it is a gap the selector
 * checks above cannot see: the selector is fine, the substitution is not.
 *
 * The check is deliberately one-directional. A variable PASSED but unused is
 * harmless (and normal while a flow is being written); a variable USED but not
 * passed is a guaranteed timeout.
 */
const RUNNER = 'scripts/android-device-pass.sh';
const missingVars = [];
if (existsSync(RUNNER)) {
  const runner = readFileSync(RUNNER, 'utf8');
  const passed = new Set(
    [...runner.matchAll(/-e\s+([A-Z][A-Z0-9_]*)=/g)].map((m) => m[1]),
  );
  for (const file of readdirSync(FLOWS).filter((f) => f.endsWith('.yaml'))) {
    const text = readFileSync(join(FLOWS, file), 'utf8');
    for (const m of text.matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)) {
      if (!passed.has(m[1])) missingVars.push(`${file}: \${${m[1]}} is never passed by android-device-pass.sh`);
    }
  }
}

console.log(`checked ${ids.size} selector(s) across ${readdirSync(FLOWS).filter((f) => f.endsWith('.yaml')).length} flow(s)`);
console.log(`app declares ${known.size} testID literal(s) and ${prefixes.size} dynamic prefix(es)`);
if (foreign.length) {
  console.log(`${foreign.length} selector(s) target another app deliberately:`);
  for (const f of foreign) console.log('  ' + f);
}
if (missing.length) {
  console.error('FAIL: these Maestro selectors match nothing in ' + SRC + ':');
  for (const m of missing) console.error('  ' + m);
  console.error('A selector that matches nothing fails as a timeout, not as a name error.');
}
if (unresolved.length) {
  console.error('FAIL: these Maestro selectors sit under a dynamic testID that never produces them:');
  for (const m of unresolved) console.error('  ' + m);
  console.error('This is how pref-message passed while the switch did not exist.');
}
if (missingVars.length) {
  console.error('FAIL: these Maestro flows use a variable the device runner never passes:');
  for (const m of missingVars) console.error('  ' + m);
  console.error('Maestro substitutes the literal text and then times out looking for it.');
}
if (missing.length || unresolved.length || missingVars.length) process.exit(1);
// What is still NOT verified, stated plainly rather than left to be discovered.
//
// A dynamic prefix used to match ANY suffix, which let `media-item-video` pass
// while no such item existed and `pref-message` pass while the switch did not.
// A plain-string selector under a prefix is now resolved against the literals in
// the file that builds it and the modules it imports as values.
//
// A REGEX selector under a dynamic prefix (`open-conversation-.*`) is still
// unverified, and unverifiable here: it means "whichever id the server
// produced", and no static check can know those. Prefer ids that carry meaning
// (`media-item-video-1`) over positional ones a typo can imitate.
console.log('OK: every Maestro selector exists in the app.');
