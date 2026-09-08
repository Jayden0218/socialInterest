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

  /** The shortest supported screen, and what is left of it under a keyboard. */
  const WIDTH = 320;
  const FULL = 640;
  const KEYBOARD_UP = 390;

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

  it('and STILL on screen with the bottom 250 points gone, as a keyboard takes', async () => {
    await open(KEYBOARD_UP);
    const submit = await box('sign-in-submit');

    // The assertion run 39 would have failed: 409 against 390.
    expect(submit.y + submit.height).toBeLessThanOrEqual(KEYBOARD_UP);

    // And the field, or there is nothing to type into.
    const field = await box('sign-in-token');
    expect(field.y + field.height).toBeLessThanOrEqual(KEYBOARD_UP);
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
    await open(KEYBOARD_UP);
    const scrolls = await page.locator('[data-testid="sign-in-screen"]').evaluate((el: unknown) => {
      const g = globalThis as unknown as { getComputedStyle(n: unknown): { overflowY: string } };
      return ['auto', 'scroll'].includes(g.getComputedStyle(el).overflowY);
    });
    expect(scrolls).toBe(false);
    await page.close();
  }, 180_000);
});
