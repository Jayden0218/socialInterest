import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A SCREEN OF STATIC CONTENT MUST SCROLL.
 *
 * `Screen` was a plain `View`, so anything taller than the display was simply
 * unreachable: no scroll, no scrollbar, no clue - the control was just not
 * there. Emulator run 35 failed `09-report-and-block` on
 * `block-person is visible`, and the measurement in
 * `apps/e2e/browser/safety-fit.spec.ts` put that button's bottom edge at 665px
 * on a 640px-tall screen.
 *
 * WHAT MAKES THIS WORTH A GUARD rather than a one-line fix: with pre-006 line
 * metrics the same button measured 627 - inside 640 by THIRTEEN PIXELS. 006's
 * type scale added ~38px and pushed it out, but a longer warning sentence, a
 * larger platform font, or a slightly shorter phone would each have done it
 * alone. The screen was always one edit away from hiding a safety control
 * (Constitution IV), and nothing would have said so.
 *
 * The rule: a file that renders `<Screen>` and owns NO scrolling list of its
 * own must pass `scroll`. Where a list is present the list scrolls, and
 * wrapping a `FlatList` in a `ScrollView` breaks virtualisation - so those are
 * exempt, by the presence of the list rather than by a name on a list of
 * exceptions.
 *
 * This cannot see a screen that fits today and stops fitting tomorrow, and it
 * is not trying to: it makes the content REACHABLE. What it can see is the
 * whole class of screens where reaching it is impossible.
 */
const SRC = join(__dirname, '..');
const SCROLLS_ITSELF = /FlatList|SectionList|ScrollView|PagedPostList/;

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

describe('a screen of static content can be scrolled to the bottom', () => {
  it('every <Screen> without a scrolling list of its own passes `scroll`', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      // `primitives.tsx` DEFINES Screen; it does not render one.
      if (file.endsWith('primitives.tsx')) continue;
      const src = readFileSync(file, 'utf8');
      const opens = [...src.matchAll(/<Screen(\s[^>]*)?>/g)];
      if (opens.length === 0) continue;
      if (SCROLLS_ITSELF.test(src)) continue;
      for (const m of opens) {
        if (!/\bscroll\b/.test(m[1] ?? '')) {
          offenders.push(`${file.slice(file.indexOf('src/'))} → ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * And the safety sheet specifically, by name. It is the one that failed on a
   * device, it is a Principle IV control, and a rule with an exemption clause
   * deserves one case pinned to the behaviour rather than to the rule.
   */
  it('the safety sheet scrolls, so the block control is always reachable', () => {
    const src = readFileSync(join(SRC, 'features/safety/SafetyActions.tsx'), 'utf8');
    expect(src).toMatch(/<Screen testID="safety-actions" scroll>/);
  });
});
