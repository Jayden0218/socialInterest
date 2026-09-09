import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';

/**
 * 008/US1 + US10, after emulator run 52 — A MULTI-PHOTO POST MUST STILL BE
 * PUBLISHABLE ON A SMALL PHONE.
 *
 * `23-multi-photo-post` passed on the device in runs 49 and 51 and failed on the
 * first run carrying US10's per-image description field, with
 * `Element not found: interest-option-0`. Choosing an interest is REQUIRED to
 * publish (001/FR-006), so the screen had made its own publish button
 * unreachable for exactly the post 008/US1 exists to make possible.
 *
 * MEASURED AT THE EMULATOR'S OWN VIEWPORT, not at a round number. The AVD's
 * colour buffers in run 52's log are 320x640 and 320x616, and 320 is the number
 * that matters: three 104pt tiles do not fit across 320 minus the page's
 * padding, so they wrapped to a second row, each row 198pt tall because of the
 * description box.
 *
 * | at 320x616            | before | after |
 * |---|---|---|
 * | `upload-slots` height | 404 | 198 |
 * | `interest-option-0` bottom | 753 | 547 |
 *
 * A row that scrolls SIDEWAYS is bounded at one row height for any number of
 * media. The wrapping grid was unbounded in the one direction the screen cannot
 * afford, and the bound is the fix rather than a larger number.
 *
 * This is a browser measurement and says nothing about native scroll, touch or
 * font scaling — the same limit `safety-fit.spec.ts` states about itself. What
 * it does is turn a 39-minute device failure into a 4-second one.
 */
describe('008 compose fits its required controls with the maximum media on a small phone', () => {
  let browser: Browser;
  let web: WebServer;
  let page: Page;

  beforeAll(async () => {
    web = await startWebServer(`${baseUrl()}/v1`);
    browser = await launchChromium();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await web?.stop();
  });

  it('the interest picker stays above the fold with three images at 320x616', async () => {
    const me = await actor(`composefit${Math.random().toString(36).slice(2, 7)}`);
    page = await browser.newPage({ viewport: { width: 320, height: 616 } });
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, me.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="tab-feed"]', { timeout: 30_000 });

    await page.click('[data-testid="open-compose"]');
    await page.waitForSelector('[data-testid="media-picker-screen"]', { timeout: 30_000 });
    // Three, the number the device flow picks — two cannot distinguish "wrapped"
    // from "did not need to".
    await page.click('[data-testid="media-item-image-0"]');
    await page.click('[data-testid="media-item-image-1"]');
    await page.click('[data-testid="media-item-image-2"]');
    await page.click('[data-testid="media-continue"]');
    await page.waitForSelector('[data-testid="compose-screen"]', { timeout: 30_000 });

    const media = await page.locator('[data-testid="upload-slots"]').boundingBox();
    const interest = await page.locator('[data-testid="interest-option-0"]').first().boundingBox();
    expect(media).not.toBeNull();
    expect(interest).not.toBeNull();

    /**
     * ONE ROW, whatever the count. This is the invariant; the number below is
     * its consequence. A guard asserting only the consequence would pass again
     * the moment somebody shrank a tile, and fail again the moment a description
     * box grew — which is how run 52 happened.
     */
    expect(media!.height).toBeLessThan(280);

    // And the required control is reachable without scrolling.
    expect(interest!.y + interest!.height).toBeLessThanOrEqual(616);

    await page.close();
  }, 180_000);
});
