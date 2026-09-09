import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 008 — the shared half of the "this module cannot reach that one" guards.
 *
 * `ranking-cannot-admit`, `feed-does-not-read-place-follows`,
 * `selection-not-boundary` and `following-feed-is-unranked` are all the same
 * check with different arguments. Four copies is four places for the
 * comment-stripping to be got wrong — and this project has been bitten in BOTH
 * directions: 004 found a guard a COMMENT made pass over a real violation, and
 * 007 found the mirror, where a doc comment containing an example made
 * `text-has-colour` accuse the one file whose job was to prevent the thing.
 *
 * 008/FR-009 and FR-021 are also literally the same requirement — "records no
 * behavioural ranking signals" — on two surfaces, so their guards share this
 * rather than being two things that can drift.
 */

/**
 * Comments blanked LINE BY LINE, preserving the line count.
 *
 * The line count matters: these guards report a line number, and a stripper that
 * collapsed a block comment would send the next person to the wrong line.
 */
export function strippedCode(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

export function tsFiles(target: string): string[] {
  if (statSync(target).isFile()) return target.endsWith('.ts') ? [target] : [];
  const out: string[] = [];
  for (const entry of readdirSync(target)) {
    const full = join(target, entry);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Every place a forbidden identifier appears in CODE, as `path:line → name`.
 *
 * Returns locations rather than a boolean so a failure names the file, the line
 * and the identifier. "expected [] to equal [...]" sends the next person
 * hunting; this sends them to the line.
 */
export function forbiddenReferences(targets: string[], forbidden: string[]): string[] {
  const offenders: string[] = [];
  for (const target of targets) {
    for (const file of tsFiles(target)) {
      const rel = file.slice(file.indexOf('src/'));
      strippedCode(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          for (const name of forbidden) {
            if (line.includes(name)) offenders.push(`${rel}:${i + 1} → ${name}`);
          }
        });
    }
  }
  return offenders;
}

/**
 * The identifiers a module would have to name to record a ranking signal.
 *
 * Shared by the Following feed (FR-009) and post search (FR-021), because they
 * are one requirement on two surfaces.
 */
export const SIGNAL_AND_RANKING_IDENTIFIERS = [
  'SignalService',
  'signal.service',
  'SignalRepository',
  'signal.repository',
  'RankingService',
  'ranking.service',
  'CandidateSource',
  'candidate-source',
];
