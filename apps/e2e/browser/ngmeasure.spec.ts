import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';

/**
 * 005/J-21, 007/T052 — THE SEARCH RESULTS STAY WHERE A KEYBOARD CANNOT HIDE
 * THEM, and the bound comes from a device run rather than from arithmetic.
 *
 * `21-group-chat` types into the group search field and then taps a RESULT,
 * with the soft keyboard up. There is no invariant available here the way there
 * is on sign-in — a results list is BELOW the field it belongs to, necessarily
 * — so this is a measurement, and the question is what to measure against.
 *
 * NOT "640 minus a keyboard". That is the mistake `signin-fit.spec.ts` records:
 * react-native-web has no soft keyboard, so any keyboard height used here would
 * be invented, and three device runs were spent on an invented 250.
 *
 * The bound is the layout that PASSED ON A DEVICE. Runs 34 and 37 both drove
 * this flow to completion, and that layout put the second result at 245-289 at
 * 320x640. Whatever the emulator's keyboard actually takes, it left 289
 * reachable twice. So 289 plus a small allowance is a bound with evidence
 * behind it, and this fails if a redesign pushes the list below where a working
 * run had it.
 *
 * It caught exactly that: 007/T052's first rebuild added a title header and a
 * "SUGGESTED" row above the list and put the second result at 358-402 — a
 * hundred and thirteen points lower than the layout that worked.
 */
describe('005/J-21 - the group search results stay reachable under a keyboard', () => {
  let browser: Browser;
  let web: WebServer;
  let page: Page;

  /** Measured from the layout that passed device runs 34 and 37, plus 40pt. */
  const REACHED_ON_A_DEVICE = 289;
  const ALLOWANCE = 40;

  beforeAll(async () => {
    web = await startWebServer(`${baseUrl()}/v1`);
    browser = await launchChromium();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await web?.stop();
  });

  it('the second result sits no lower than the layout a device drove to completion', async () => {
    const prefix = `ngm${Math.random().toString(36).slice(2, 6)}`;
    const me = await actor(`${prefix}self`);
    const a = await actor(`${prefix}alpha`);
    const b = await actor(`${prefix}beta`);

    page = await browser.newPage({ viewport: { width: 320, height: 640 } });
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, me.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="tab-chats"]', { timeout: 30_000 });
    await page.click('[data-testid="tab-chats"]');
    await page.click('[data-testid="new-group"]');
    await page.waitForSelector('[data-testid="new-group-screen"]', { timeout: 30_000 });
    await page.fill('[data-testid="group-search-input"]', prefix);
    await page.waitForSelector(`[data-testid="group-participant-${a.handle}"]`, { timeout: 30_000 });

    const box = async (id: string) => {
      const found = await page.locator(`[data-testid="${id}"]`).boundingBox();
      expect({ id, found: found !== null }).toEqual({ id, found: true });
      return found!;
    };

    // BOTH results, because the flow taps the first and then asserts the
    // second: a bound that only covered the first would pass on the layout
    // whose SECOND row fell off.
    for (const handle of [a.handle, b.handle]) {
      const row = await box(`group-participant-${handle}`);
      expect({
        handle,
        bottom: Math.round(row.y + row.height),
        limit: REACHED_ON_A_DEVICE + ALLOWANCE,
        ok: row.y + row.height <= REACHED_ON_A_DEVICE + ALLOWANCE,
      }).toMatchObject({ ok: true });
    }

    /**
     * And Create is near the TOP, not at the bottom. That is the sign-in lesson
     * carried across: a submit control below a text field is one a keyboard can
     * hide, and no browser measurement can tell you whether it has.
     */
    const create = await box('create-group');
    const search = await box('group-search-input');
    expect({ createBottom: Math.round(create.y + create.height), searchTop: Math.round(search.y), ok: create.y + create.height <= search.y })
      .toMatchObject({ ok: true });

    await page.close();
  }, 180_000);
});
