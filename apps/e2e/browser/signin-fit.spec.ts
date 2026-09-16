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

  it('the fields and the submit button are on screen at 320x640', async () => {
    await open(FULL);
    for (const id of ['sign-in-email', 'sign-in-password', 'sign-in-submit']) {
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
  /**
   * 009/T017. A SECOND FIELD ARRIVED, AND THE INVARIANT IS WHY THAT WAS SAFE.
   *
   * US1 put a server-address field on this screen, above the token field. Adding
   * a field moves the fold — which is exactly the change that broke this screen
   * before — but it cannot move a control that sits above BOTH fields.
   *
   * Measured 2026-09-12 at 320 wide, at heights 640, 616 and 390, all three
   * identical because the column is top-aligned:
   *
   *   submit   top  77  bottom 121
   *   address  top 313  bottom 358
   *   token    top 370  bottom 436
   *
   * Those numbers are the CONSEQUENCE and are recorded, not asserted. A guard
   * that pins 121 passes again the moment a control shrinks; the ordering is
   * what actually protects the screen. The token field moved down ~57 points to
   * make room, which is the honest cost of the field and is fine precisely
   * because the submit did not move.
   */
  /**
   * 011. A THIRD FIELD ARRIVED, AND THE INVARIANT HELD AGAIN.
   *
   * The token field became an email address AND a password (FR-027), so this
   * screen now carries three fields where it carried one when the defect was
   * found. Each addition pushes the fold further up — which is precisely the
   * change that broke this screen in the first place — and none of them can
   * move a control that sits above every field.
   *
   * That is the second time this invariant has absorbed a change that the old
   * arithmetic guard would have had to be re-tuned for, and the old guard would
   * have re-tuned to a number that was invented in the first place.
   */
  it('the submit stays above EVERY field, however many there are', async () => {
    await open(FULL);
    /**
     * 011/FR-029. THE ADDRESS FIELD IS BEHIND A CONTROL IN THIS BUILD, and this
     * test did not know that.
     *
     * The e2e bundle is built with `EXPO_PUBLIC_API_BASE_URL` set (global-setup
     * does it so the browser cannot be pointed at the wrong API), so
     * `ADDRESS_IS_COMPILED_IN` is true, `addressFixed` is true, and the address
     * starts hidden behind `sign-in-change-server` — "the address stays
     * reachable and stops being part of the ordinary path", which is the
     * product working. The test waited thirty seconds for a field the build is
     * specified not to show and failed on a `boundingBox` of nothing.
     *
     * Revealing it is also the STRICTER measurement: three fields push the fold
     * further up than two, and the invariant is that no number of them can
     * reach a control that sits above all of them.
     */
    await page.click('[data-testid="sign-in-change-server"]');
    const submit = await box('sign-in-submit');
    const address = await box('sign-in-address');
    const email = await box('sign-in-email');
    const password = await box('sign-in-password');

    const bottom = submit.y + submit.height;
    expect({
      submitBottom: Math.round(bottom),
      addressTop: Math.round(address.y),
      emailTop: Math.round(email.y),
      passwordTop: Math.round(password.y),
      aboveAddress: bottom <= address.y,
      aboveEmail: bottom <= email.y,
      abovePassword: bottom <= password.y,
    }).toMatchObject({ aboveAddress: true, aboveEmail: true, abovePassword: true });

    // The address field is ABOVE the credentials: a person names the server
    // before identifying themselves to it, and reading them in the other order
    // invites signing in to the backend you are about to leave.
    expect(address.y).toBeLessThan(email.y);
    expect(email.y).toBeLessThan(password.y);
    await page.close();
  }, 180_000);

  it('the submit button is ABOVE the field, so no keyboard height can hide it', async () => {
    await open(FULL);
    const submit = await box('sign-in-submit');
    // The FIRST field a person taps — the one whose keyboard opens first, and
    // the one run 41's log named when the button vanished under it.
    const field = await box('sign-in-email');

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
    for (const id of ['sign-in-email', 'sign-in-password', 'sign-in-submit']) {
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
