import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * NOTHING MAY STAND IN FOR AN ICON — 012/SC-009, FR-027, FR-029.
 *
 * Before feature 012 this application contained no icons at all. Five
 * navigation destinations were an 8x8 `View` with a pill radius; a reaction was
 * the character `♥`; a comment count was a bare number. There was no icon set,
 * no icon component, and so nothing for any screen to be consistent WITH —
 * which is the finding, rather than "there are no icons" (012/R8).
 *
 * Two questions, both asked of the BUILD and not of the prose:
 *
 *   1. Does anything draw an icon outside `ui/Icon.tsx`?
 *   2. Does any rendered string contain a character doing an icon's job?
 *
 * THE SECOND QUESTION IS ASKED AS A PROPERTY, NOT AS A LIST. The first draft of
 * this guard enumerated `♥ ★ ☆ → ← ✓ ✕ ×`, which is the shape this repository
 * has been bitten by twice: 004's first `auth-surface` guard was a hand-picked
 * list of routes and missed the second occurrence of the very defect it was
 * written for, and 011's constant-time guard passed a deliberate break because
 * the break was not one of three hand-guessed spellings. A list only covers the
 * mistakes somebody already made. So the rule is the general one — no non-ASCII
 * presentational character in a string the product renders — with a short,
 * explicit allow-list of the characters that are TYPOGRAPHY rather than
 * pictures.
 */
const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Comments blanked LINE BY LINE, because this guard reports a line number and a
 * stripper that eats newlines sends somebody to the wrong part of the file.
 *
 * Both directions of the comment problem are live here. A comment naming `♥`
 * would make a violation invisible; a comment containing `♥` as an example —
 * and the file you are reading is full of them — would accuse a clean file.
 */
function stripComments(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Characters that are typography, not pictures.
 *
 * Kept SHORT and each one justified, because every addition is a hole. The test
 * below reports the exact character and file, so widening this set is a
 * deliberate, reviewable edit rather than something done to make a run green.
 */
const TYPOGRAPHY = new Set([
  '·', // a separator between two pieces of metadata
  '—', // em dash, in prose
  '–', // en dash, in ranges
  '’', '‘', '“', '”', // real quotation marks
  '…', // ellipsis
  ' ', // non-breaking space
  '°', // degrees, in a place's detail
  '×', // NOT allowed as a close button; see the note below
]);

/**
 * `×` IS ON THE LIST AND IS STILL BANNED WHERE IT MATTERS.
 *
 * It is a legitimate multiplication sign ("3 × 4"), and it is also the single
 * most common fake close button in the world. Allowing it outright would put a
 * hole straight through the requirement, so it is permitted only when it is not
 * alone: a string that is nothing but `×`, with or without surrounding space,
 * is a control, and a control must be `Icon name="close"`.
 */
const LONE_GLYPH = /^\s*\S\s*$/u;

/** A string literal the product renders — JSX text, or a quoted string. */
function renderedStrings(src: string): { text: string; index: number }[] {
  const out: { text: string; index: number }[] = [];
  for (const m of src.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g)) {
    out.push({ text: m[2] ?? '', index: m.index ?? 0 });
  }
  /**
   * Bare JSX text between tags — `<Text>♥ {count}</Text>` is not a literal.
   *
   * THE INTERPOLATIONS ARE REMOVED, NOT AVOIDED, and the first version of this
   * function got that backwards: it refused to match any run containing `{` or
   * `}`, so `<Text>💬 {state.commentCount}</Text>` was invisible — the exact
   * `glyph {count}` shape the specification names as the defect. The guard came
   * back with eleven offenders and looked authoritative while missing one in a
   * file it had already flagged twice.
   *
   * That is this repository's most-repeated failure wearing new clothes: a
   * guard whose subject slips out from under it and passes anyway. Found here
   * only because the fix required reading the file the guard had cleared.
   */
  for (const m of src.matchAll(/>([^<>]*)</g)) {
    const text = (m[1] ?? '').replace(/\{[^{}]*\}/g, ' ');
    if (text.trim() === '') continue;
    out.push({ text, index: m.index ?? 0 });
  }
  return out;
}

const lineOf = (src: string, index: number): number => src.slice(0, index).split('\n').length;

describe('nothing stands in for an icon (SC-009, FR-027)', () => {
  it('only ui/Icon.tsx draws an icon', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const rel = file.replace(SRC, 'src');
      // The one file allowed to reach for the drawing primitives, and the file
      // that holds the path data it draws.
      if (rel === 'src/ui/Icon.tsx' || rel === 'src/ui/icons.ts') continue;

      const src = stripComments(readFileSync(file, 'utf8'));
      for (const m of src.matchAll(/from\s+['"]react-native-svg['"]/g)) {
        offenders.push(`${rel}:${lineOf(src, m.index ?? 0)} imports react-native-svg directly`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('no rendered string uses a character as a picture', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const rel = file.replace(SRC, 'src');
      if (rel === 'src/ui/icons.ts') continue; // SVG path data, never rendered as text

      const src = stripComments(readFileSync(file, 'utf8'));
      for (const { text, index } of renderedStrings(src)) {
        for (const ch of text) {
          // ASCII is prose, punctuation and code. It is never a pictogram.
          if (ch.charCodeAt(0) < 0x80) continue;
          /**
           * LETTERS AND DIGITS ARE PROSE IN EVERY LANGUAGE, and the first run of
           * this guard did not know that: it accused `CreatePlaceScreen.tsx` of
           * rendering `é` — inside the word "café". That is the cry-wolf failure
           * `text-has-colour` recorded when a doc comment made it accuse the one
           * file whose job was the thing being checked, and a guard that accuses
           * correct code is a guard somebody switches off.
           *
           * The property wanted is "a character doing a picture's job", which is
           * a SYMBOL, not a letter. Unicode already draws that line, so the test
           * asks Unicode rather than keeping a second list of its own.
           */
          if (/\p{L}|\p{N}|\p{M}/u.test(ch)) continue;
          if (!TYPOGRAPHY.has(ch)) {
            offenders.push(`${rel}:${lineOf(src, index)} renders ${JSON.stringify(ch)}`);
            continue;
          }
          // Allowed character, disallowed job: alone, it is a control.
          if (ch === '×' && LONE_GLYPH.test(text)) {
            offenders.push(`${rel}:${lineOf(src, index)} uses "×" as a control — use Icon name="close"`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * FR-028 — EVERY NAVIGATION DESTINATION IS AN ICON WITH A LABEL.
 *
 * A separate assertion because the scans above structurally cannot see this
 * one. The tab bar's "icon" was an 8x8 `View` with a pill radius: it imports no
 * SVG and renders no character, so it is invisible to both questions. It was
 * not a wrong icon — it was the ABSENCE of one, which is a different defect and
 * needs a different question.
 *
 * Narrow on purpose. "No small square View anywhere" would be a guard built
 * from a constant, which is the shape that cost four device runs in 006/007 —
 * it would fire on spacers, rules and swatches and say nothing about
 * navigation. This asks the only thing FR-028 actually requires, of the one
 * component that renders a destination.
 */
describe('every navigation destination is an icon with a label (FR-028)', () => {
  it('TabButton draws an Icon', () => {
    const src = stripComments(readFileSync(join(SRC, 'App.tsx'), 'utf8'));
    const start = src.indexOf('function TabButton');
    expect(start).toBeGreaterThan(-1);
    // To the next top-level declaration, so this reads TabButton and not the file.
    const next = src.indexOf('\nfunction ', start + 1);
    const body = src.slice(start, next === -1 ? undefined : next);

    expect(body).toContain('<Icon');
    // The label half of the requirement. A row of unlabelled icons is the other
    // way to fail Material Design 3's rule, and it is the more fashionable one.
    expect(body).toContain('tab.label');
  });
});
