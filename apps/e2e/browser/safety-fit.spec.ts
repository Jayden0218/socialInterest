import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

/**
 * 006/J-09: THE BLOCK CONTROL IS REACHABLE ON A SHORT SCREEN.
 *
 * Emulator run 35 failed `09-report-and-block` on `block-person is visible`.
 * The cause was not the flow: `Screen` was a plain `View`, so the safety sheet
 * could not be scrolled and the button - at 665px on a 640px-tall display - was
 * unreachable. A safety affordance nobody can reach is Constitution IV failing
 * quietly, and it took a 30-minute device run to see it.
 *
 * This settles the same thing in seconds, which is the point. Every browser
 * screenshot in `docs/screens` is 414x896, where the button sits comfortably
 * inside the viewport; the defect only exists below ~665px of height, and
 * nothing here had ever looked at a short screen.
 *
 * It does NOT replace the device flow. react-native-web renders the same
 * components through DOM primitives, so it says nothing about native scroll
 * physics or touch. It makes the next device run spend its 30 minutes on what
 * only a device can answer.
 */
describe('006/J-09 - the safety sheet on a short screen', () => {
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

  async function openSafetySheet(width: number, height: number): Promise<void> {
    page = await browser.newPage({ viewport: { width, height } });
    const author = await actor(`sfa${width}x${height}`);
    const reader = await actor(`sfr${width}x${height}`);
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'safety fit' });
    await reader.data.interests.follow(interest.interestId);
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, reader.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="tab-feed"]', { timeout: 30_000 });
    await page.click('[data-testid="tab-feed"]');
    await page.waitForSelector(`[data-testid="post-${postId}"]`, { timeout: 30_000 });
    await page.click(`[data-testid="post-${postId}"]`);
    await page.click('[data-testid="open-safety"]');
    await page.waitForSelector('[data-testid="report-reasons"]', { timeout: 30_000 });
  }

  /**
   * 320x640 is SHORTER than the sheet is tall. That is the whole test: the
   * control must still be reachable, and before this fix it was not.
   */
  it('the block control is below the fold on a short screen, and can be scrolled to', async () => {
    await openSafetySheet(320, 640);
    const target = page.locator('[data-testid="block-person"]');

    // First: confirm this screen really is the failing case, so a future layout
    // change that makes the sheet short cannot leave this passing vacuously.
    const laidOutAt = (await target.boundingBox())!;
    expect(laidOutAt.y + laidOutAt.height).toBeGreaterThan(640);

    // Then: an ANCESTOR OF THE ELEMENT SCROLLS.
    //
    // Not `scrollIntoViewIfNeeded`, which was the first version of this and
    // passed with the defect still in place: Playwright happily scrolls the
    // DOCUMENT, and a browser page scrolls when a React Native screen does not.
    // The browser was answering a question the device never asks. Verified by
    // reverting the fix and watching it stay green.
    //
    // What maps to a device is whether the APP's own container can scroll, so
    // that is what this walks the tree for.
    //
    // Typed loosely on purpose: this package is typed for Node and has no DOM
    // lib, and the function below is serialised and runs in the page.
    const scrollable = await target.evaluate((el: unknown) => {
      type Node = { parentElement: Node | null; scrollHeight: number; clientHeight: number };
      const g = globalThis as unknown as {
        getComputedStyle(n: unknown): { overflowY: string };
      };
      for (let n = el as Node | null; n; n = n.parentElement) {
        const overflowY = g.getComputedStyle(n).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
          return true;
        }
      }
      return false;
    });
    expect(scrollable).toBe(true);
    await page.close();
  }, 180_000);

  it('and is visible without scrolling on a tall screen', async () => {
    await openSafetySheet(414, 896);
    const box = (await page.locator('[data-testid="block-person"]').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(896);
    await page.close();
  }, 180_000);
});
