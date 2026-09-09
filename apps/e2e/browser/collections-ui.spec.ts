import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

/**
 * 008/US15 — THE SHELVES ARE REACHABLE, AND FILING REALLY FILES.
 *
 * `journeys/collections.spec.ts` proves the SERVER keeps FR-051; this proves
 * the app can reach it. Those are different claims, and 003 found the gap
 * between them the hard way — `ProfileContainer` loaded the wrong person with a
 * follow button wired to `() => undefined` while every screen test was green.
 *
 * Run before the device, so the device spends its minutes on what only a device
 * can answer. It is not a substitute: react-native-web has no native scroll and
 * ignores the platform font setting.
 *
 * Every assertion lands on the SERVICE at the end. A file control that flipped
 * local state renders identically, and that is exactly the defect this feature
 * is about.
 */
describe('008/US15 collections, from the app', () => {
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

  it('a shelf is created from Saved, a post is filed from post detail, and it stays in All', async () => {
    const me = await actor(`collui${Math.random().toString(36).slice(2, 7)}`);
    const author = await actor(`colluiauthor${Math.random().toString(36).slice(2, 7)}`);
    const interest = (await me.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], {
      caption: 'something to file',
    });

    page = await browser.newPage({ viewport: { width: 414, height: 896 } });
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, me.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="tab-profile"]', { timeout: 30_000 });

    // FROM THE MAIN SCREEN, no deep link: profile, Saved, name a shelf.
    await page.click('[data-testid="tab-profile"]');
    await page.click('[data-testid="open-saved"]');
    await page.waitForSelector('[data-testid="saved-screen"]', { timeout: 30_000 });
    await page.fill('[data-testid="new-collection-name"]', 'Recipes');
    await page.click('[data-testid="create-collection"]');

    const collectionId = await (async () => {
      for (let i = 0; i < 60; i++) {
        const items = (await me.data.saved.collections({ limit: 50 })).items;
        const found = items.find((c) => c.name === 'Recipes');
        if (found) return found.collectionId;
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error('creating a collection never reached the server');
    })();

    /**
     * BACK FIRST — A PUSHED SCREEN HAS NO TAB BAR (005/J-21).
     *
     * Saved is pushed, so `tab-feed` does not exist while it is open. The first
     * version of this test reached for the tab bar from here and timed out for
     * its own reason rather than the product's, which is the mistake that
     * lesson exists to stop.
     */
    await page.click('[data-testid="nav-back"]');
    await page.waitForSelector('[data-testid="tab-feed"]', { timeout: 30_000 });
    await page.click('[data-testid="tab-feed"]');
    await page.waitForSelector(`[data-testid="post-${postId}"]`, { timeout: 60_000 });
    await page.click(`[data-testid="post-${postId}"]`);
    await page.waitForSelector('[data-testid="post-detail-screen"]', { timeout: 30_000 });
    await page.click(`[data-testid="file-into-${collectionId}"]`);

    await (async () => {
      for (let i = 0; i < 60; i++) {
        const inShelf = await me.data.saved.collectionPosts(collectionId, { limit: 50 });
        if (inShelf.items.some((p) => p.postId === postId)) return;
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error('filing never reached the server');
    })();

    /**
     * FR-051, THROUGH THE APP. The post is in the shelf AND in the
     * undifferentiated list — a "move" implementation passes the first and fails
     * this, which is why both are asserted and why this one is second.
     */
    const all = await me.data.saved.list({ limit: 50 });
    expect(all.items.map((p) => p.postId)).toContain(postId);

    // And the screen's own filter agrees, both ways round. Back out of post
    // detail first — pushed, so no tab bar, the same rule as above.
    await page.click('[data-testid="nav-back"]');
    await page.waitForSelector('[data-testid="tab-profile"]', { timeout: 30_000 });
    await page.click('[data-testid="tab-profile"]');
    await page.click('[data-testid="open-saved"]');
    await page.waitForSelector(`[data-testid="collection-tab-${collectionId}"]`, { timeout: 30_000 });
    await page.click(`[data-testid="collection-tab-${collectionId}"]`);
    await page.waitForSelector(`[data-testid="post-${postId}"]`, { timeout: 30_000 });
    await page.click('[data-testid="collection-tab-all"]');
    await page.waitForSelector(`[data-testid="post-${postId}"]`, { timeout: 30_000 });

    await page.close();
  }, 300_000);
});
