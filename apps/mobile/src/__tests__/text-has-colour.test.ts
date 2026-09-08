import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * EVERY `<Text>` MUST CHOOSE A COLOUR.
 *
 * React Native's `Text` inherits the platform default - black - when no colour
 * is given. Under the old white theme that was invisible luck. Against the dark
 * green surface it renders near-black on near-black, and the post caption in
 * every list in the app did exactly that.
 *
 * The contrast test could not catch it and never will: it checks that the
 * TOKENS are legible against each other. A token nobody applies is a colour
 * nobody sees. This checks the other half - that a colour was chosen at all -
 * and the two together are what "the theme is applied" means.
 *
 * Found by looking at a screenshot, which is the only reason this file exists.
 */
const SRC = join(__dirname, '..');

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * A style prop counts as choosing a colour when the opening tag mentions
 * `color`, or hands off to a named style whose definition does.
 *
 * Deliberately generous: this guard exists to catch a `<Text>` with NO styling
 * at all, which is the failure that shipped. Being stricter would fail on
 * legitimate composition and get switched off, and a guard nobody runs catches
 * nothing.
 */
const NAMED_STYLE = /style=\{([A-Za-z_$][\w$]*)\}/;

describe('no Text renders with the platform default colour', () => {
  it('every <Text> chooses a colour, directly or through a named style', () => {
    const offenders: string[] = [];

    for (const file of tsxFiles(SRC)) {
      const raw = readFileSync(file, 'utf8');
      /**
       * Arrow functions first, or the tag match ends early.
       *
       * `<Text onPress={() => open()} style={{ color }}>` contains a `>` inside
       * the prop, so scanning to the first `>` stops before the style and
       * reports a colour that is right there. This guard's own first run did
       * exactly that and accused a correct file - worth keeping in mind, because
       * a guard that cries wolf is one somebody switches off.
       */
      /**
       * COMMENTS STRIPPED FIRST, and this file learned it the same way the
       * other four did — from the opposite direction.
       *
       * The usual failure is a comment naming a forbidden identifier and making
       * a guard pass against a violation. This one is the mirror: a doc comment
       * containing `<Text style={{...textStyle.display}}>` as an EXAMPLE made
       * the guard accuse `primitives.tsx`, the file whose whole job is to give
       * every Text a colour. Prose describes the intention; only the build is
       * the build, in both directions.
       */
      const src = raw
        // Blanked LINE BY LINE rather than collapsed to a space: this guard
        // reports a line number, and a stripper that removes newlines reports
        // the wrong one - which sends somebody to the wrong part of the file
        // and is how a real failure gets dismissed as noise.
        .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .replace(/=>/g, '=\u00bb');
      for (const m of src.matchAll(/<Text\b[^>]*?>/gs)) {
        const tag = m[0];
        if (tag.includes('color')) continue;

        const named = NAMED_STYLE.exec(tag);
        // The named style is defined in this file; if its definition sets a
        // colour, the Text has one.
        if (named && new RegExp(`${named[1]}\\s*[=:][^;]*color`, 's').test(src)) continue;

        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${file.replace(SRC, 'src')}:${line}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * FR-021: text respects the platform's font-scaling setting.
 *
 * `allowFontScaling={false}` opts one `<Text>` out of that, and it is the
 * easiest possible fix for any text that overflows its box - which is exactly
 * why it needs a guard rather than a code review. Turning it off makes the
 * symptom disappear and makes the app unusable for somebody who set a large
 * font because they need one.
 *
 * ONE exception is allowed and named here: the initial inside `Avatar`, a
 * decorative glyph sized from a fixed-diameter circle, hidden from assistive
 * tech, standing beside the name it abbreviates. Anything else is a bug.
 *
 * This is a guard for a DEVICE-ONLY symptom. react-native-web ignores the
 * platform setting, so no browser journey and no screenshot in `docs/screens`
 * could ever show the overflow that prompted it.
 */
describe('font scaling is not switched off (FR-021)', () => {
  const ALLOWED = new Set(['Avatar.tsx']);

  it('only Avatar opts out of platform font scaling', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const name = file.split('/').pop() ?? '';
      if (ALLOWED.has(name)) continue;
      const src = readFileSync(file, 'utf8');
      if (/allowFontScaling=\{false\}|allowFontScaling={\s*false\s*}/.test(src)) {
        offenders.push(file.slice(file.indexOf('src/')));
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * And the exception must stay real. If somebody deletes the opt-out from
   * `Avatar` this passes for the wrong reason, so assert it is still there -
   * a guard that permits a thing should check the thing still exists.
   */
  it('Avatar still carries the opt-out the exception is granted for', () => {
    const src = readFileSync(join(SRC, 'components/Avatar.tsx'), 'utf8');
    expect(src).toMatch(/allowFontScaling=\{false\}/);
  });
});
