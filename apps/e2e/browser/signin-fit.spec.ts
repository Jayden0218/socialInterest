import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';

/**
 * ===========================================================================
 * SIGN-IN MUST BE COMPLETABLE WITH THE KEYBOARD UP. Run 39 is why.
 * ===========================================================================
 *
 * This screen has now broken the device suite TWICE, from opposite directions,
 * and both times the cost was a whole 25-minute run:
 *
 *   run 36  I made it a ScrollView, on a rule inferred from one measurement of
 *           a different screen. 18/19 became 1/19.
 *   run 39  I rebuilt it to the artboard with `justifyContent: 'center'`. The
 *           submit button landed at y=365..409 once the soft keyboard takes
 *           ~250 points of a 640pt screen — NINETEEN POINTS below the fold, on
 *           a screen that deliberately does not scroll.
 *
 * The API aggregate is what named it, as the run-36 record says it would:
 * `GET /v1/me` 200 THREE times, every one a host-side fixture and none from the
 * device, against `GET /v1/feed/home` 401 twenty-one times. The app was signed
 * out for the entire run.
 *
 * So the screen with a keyboard is the one screen that gets a keyboard-up
 * measurement. A smaller VIEWPORT is not a soft keyboard — react-native-web has
 * none — but it is the right question asked of the layout: with the bottom 250
 * points gone, is the control a person must reach still on screen?
 */
describe('sign-in fits with the keyboard up', () => {
  let browser: Browser;
  let web: WebServer;
  let page: Page;

  /** The shortest supported screen. */
  const WIDTH = 320;
  const FULL = 640;

  beforeAll(async () => {
    web = await startWebServer(`${baseUrl()}/v1`);
    browser = await launchChromium();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await web?.stop();
  });

  async function open(height: number): Promise<void> {
    page = await browser.newPage({ viewport: { width: WIDTH, height } });
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="open-sign-in"]', { timeout: 30_000 });
    await page.click('[data-testid="open-sign-in"]');
    await page.waitForSelector('[data-testid="sign-in-screen"]', { timeout: 30_000 });
  }

  const box = async (testID: string) => {
    const found = await page.locator(`[data-testid="${testID}"]`).boundingBox();
    expect(found).not.toBeNull();
    return found!;
  };

  it('the token field and the submit button are on screen at 320x640', async () => {
    await open(FULL);
    for (const id of ['sign-in-token', 'sign-in-submit']) {
      const b = await box(id);
      expect({ id, bottom: Math.round(b.y + b.height) }).toEqual({
        id,
        bottom: expect.any(Number),
      });
      expect(b.y + b.height).toBeLessThanOrEqual(FULL);
    }
    await page.close();
  }, 180_000);

  /**
   * THE SUBMIT IS ABOVE THE FIELD — and this replaced an assertion that passed
   * while the device failed three times running.
   *
   * The old version measured at a 320x390 viewport and checked the button's
   * bottom against 390: "what is left of a 640pt screen once a keyboard takes
   * 250". It passed at 363. Runs 39, 40 and 41 all spent twenty minutes signed
   * out anyway, and run 41's flow log said exactly why — Maestro TAPPED
   * `sign-in-token` and then could not find `sign-in-submit` for 54 seconds, so
   * the button was under the keyboard.
   *
   * The guard was not measuring badly. It was measuring against a GUESS at the
   * keyboard's height, and react-native-web has no soft keyboard, so no browser
   * measurement can ever supply that number. **250 was invented, and everything
   * built on it was too.**
   *
   * So this asserts the thing that does not need the number. A control ABOVE
   * the field cannot be covered by a keyboard that opens BELOW the field: if
   * the field can be reached and typed into — which the device demonstrated
   * three times — the button can be reached too. True under `adjustResize` and
   * `adjustPan`, at any keyboard height.
   *
   * WHY THE COMMENT AND MESSAGE COMPOSERS DO NOT HAVE THIS PROBLEM, since they
   * are the obvious counter-example and both put their submit BELOW the field:
   * each sits at the bottom of a screen whose list above it is `flex: 1`. Under
   * `adjustResize` that list absorbs the shrink and the composer RIDES UP with
   * the fold, staying just above the keyboard. Flows 08 and 13 passed on device
   * runs 34 and 37 for that reason.
   *
   * Sign-in had no absorber. Its content is a top-aligned column, so every
   * control sits at a fixed offset from the top and the keyboard simply covers
   * whatever falls below it. **The rule is not "never put a submit below a
   * field" — it is that a screen with nothing to absorb the resize cannot put a
   * control where a keyboard can reach it.**
   */
  it('the submit button is ABOVE the field, so no keyboard height can hide it', async () => {
    await open(FULL);
    const submit = await box('sign-in-submit');
    const field = await box('sign-in-token');

    // Boxes in the message: a failure should say where they actually are
    // rather than only that one was below the other.
    expect({
      submitBottom: Math.round(submit.y + submit.height),
      fieldTop: Math.round(field.y),
      ok: submit.y + submit.height <= field.y,
    }).toMatchObject({ ok: true });

    await page.close();
  }, 180_000);

  /**
   * Kept, and deliberately NOT the load-bearing assertion any more: at the full
   * height both controls are on screen. It catches a layout that overflows a
   * short phone with no keyboard at all, which is a different failure from the
   * one above and still worth failing on.
   */
  it('and both controls are on screen at the shortest supported height', async () => {
    await open(FULL);
    for (const id of ['sign-in-token', 'sign-in-submit']) {
      const b = await box(id);
      expect({ id, ok: b.y + b.height <= FULL }).toEqual({ id, ok: true });
    }
    await page.close();
  }, 180_000);

  /**
   * NOT a ScrollView, and this is the run-36 half of the same lesson.
   *
   * Making this screen scroll is the obvious fix for anything that does not fit,
   * and it is the one that took the suite from 18/19 to 1/19: a tap while the
   * keyboard is up can be spent dismissing it, and neither mechanism is
   * reproducible in a browser. The screen has to FIT instead.
   */
  it('does not solve the fit by scrolling', async () => {
    await open(FULL);
    const scrolls = await page.locator('[data-testid="sign-in-screen"]').evaluate((el: unknown) => {
      const g = globalThis as unknown as { getComputedStyle(n: unknown): { overflowY: string } };
      return ['auto', 'scroll'].includes(g.getComputedStyle(el).overflowY);
    });
    expect(scrolls).toBe(false);
    await page.close();
  }, 180_000);
});
