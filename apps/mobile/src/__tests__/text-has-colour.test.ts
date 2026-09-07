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
      const src = raw.replace(/=>/g, '=\u00bb');
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
