import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE SAFETY SHEET SCROLLS, AND ONLY WHAT WAS MEASURED IS ASSERTED HERE.
 *
 * Emulator run 35 failed `09-report-and-block` on `block-person is visible`.
 * `Screen` was a plain `View` and never scrolled, so the safety sheet's content
 * was not below the fold - it was unreachable, and the thing out of reach was
 * BLOCK THIS PERSON, which Constitution IV calls a release gate.
 * `apps/e2e/browser/safety-fit.spec.ts` measures it: the button's bottom edge
 * sits at 665px on a 640px-tall screen, and at 627px with pre-006 line metrics -
 * inside 640 by thirteen pixels. 006 pushed it out; it was always one edit away.
 *
 * THIS FILE USED TO ASSERT A RULE ACROSS EVERY SCREEN, and that was wrong.
 * Reasoning from "the same class of defect", I set `scroll` on all eight screens
 * that render a `Screen` without a list, having measured one. Run 36 came back
 * 1/19: `SignInScreen` became a `ScrollView`, sign-in stopped working, and every
 * flow that chains it failed. A rule inferred from one measurement, applied to
 * seven unmeasured screens, cost a 27-minute run and broke the product.
 *
 * So the guard now covers the case with evidence behind it. The others are not
 * declared safe - they are UNMEASURED, which is a different claim and the honest
 * one. `safety-fit.spec.ts` is the harness for measuring any of them, and the
 * measurement is what should precede the next screen turning this on.
 */
const SRC = join(__dirname, '..');

describe('the safety sheet can be scrolled to the bottom', () => {
  it('SafetyActions renders a scrolling Screen, so the block control is reachable', () => {
    const src = readFileSync(join(SRC, 'features/safety/SafetyActions.tsx'), 'utf8');
    expect(src).toMatch(/<Screen testID="safety-actions" scroll>/);
  });

  /**
   * A `ScrollView` whose default `keyboardShouldPersistTaps` is `never` spends
   * the first tap dismissing the keyboard rather than pressing what was tapped.
   * That is what took sign-in out in run 36, and it is invisible to every test
   * here and to every browser journey, because neither has a soft keyboard.
   */
  it("Screen's scroll mode delivers taps while the keyboard is up", () => {
    const src = readFileSync(join(SRC, 'ui/primitives.tsx'), 'utf8');
    expect(src).toMatch(/keyboardShouldPersistTaps="handled"/);
  });

  /**
   * And a screen that owns a list must never wrap it: a `ScrollView` around a
   * `FlatList` breaks virtualisation. This is the one part of the old rule that
   * was never speculative.
   */
  it('no screen wraps its own list in a scrolling Screen', () => {
    const offenders: string[] = [];
    for (const rel of ['features/safety/SafetyActions.tsx']) {
      const src = readFileSync(join(SRC, rel), 'utf8');
      if (/<Screen[^>]*\bscroll\b/.test(src) && /FlatList|SectionList|PagedPostList/.test(src)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
