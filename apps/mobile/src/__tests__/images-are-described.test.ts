import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 008/T139, US10 — SC-011. EVERY `Image` TAG CARRIES A LABEL OR IS HIDDEN.
 *
 * PER TAG, never per file. A per-file check lets one labelled image approve
 * every other image in the same file — which is exactly how the touch-target
 * guard passed over a 36.7pt control, and how `pref-message` passed while the
 * switch did not exist. The tab bar alone holds six controls; `PostCard` holds
 * two images.
 *
 * There are two acceptable answers for any image, and a third that is a lie:
 *
 *   accessibilityLabel=...          it is content, and this says what it shows
 *   accessible={false}              it is decoration, announced by something else
 *   (neither)                       a screen reader says "image", which tells
 *                                   a person nothing and is what FR-035 forbids
 *
 * `accessibilityIgnoresInvertColors` is NOT one of them: it is about colour
 * inversion on iOS and says nothing about whether the image is described. A
 * guard that accepted it would be accepting a mechanism instead of measuring
 * the thing (007/T078's lesson about `hitSlop`).
 */
const SRC = join(__dirname, '..');

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, out);
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('008/SC-011 every image says what it is', () => {
  it('every <Image> tag carries accessibilityLabel or accessible={false}', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const rel = file.slice(file.indexOf('src/'));
      // Comments blanked LINE BY LINE, so a doc comment showing an `<Image>` as
      // an example cannot satisfy the check and a reported line number still
      // points at the real tag. 004 reverted a file to reproduce a defect and
      // found its own comment made the check pass.
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        // Arrow functions neutralised: `<Image onLoad={() => x()} ... />` has a
        // `>` inside a prop, and scanning to the first `>` would stop before the
        // label. Both stricter guards in 007 first cried wolf for this reason.
        .replace(/=>/g, '=»');

      for (const m of src.matchAll(/<Image\b[\s\S]*?\/?>/g)) {
        const tag = m[0];
        const line = src.slice(0, m.index).split('\n').length;
        const labelled = /accessibilityLabel\s*=/.test(tag);
        const hidden = /accessible\s*=\s*\{\s*false\s*\}/.test(tag);
        if (!labelled && !hidden) offenders.push(`${rel}:${line}`);
      }
    }
    // Located, not counted: a bare number sends somebody hunting through seven
    // files for an image that announces itself as "image".
    expect(offenders).toEqual([]);
  });
});
