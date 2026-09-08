import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

/**
 * 007/SC-003 — FINDABLE AND CLEARABLE FROM THE MAIN SCREEN.
 *
 * "A person can find what their feed is built from, and clear it, in under 30
 * seconds from the app's main screen, without guidance."
 *
 * That criterion is about NAVIGATION, and navigation is exactly what unit tests
 * of a screen cannot answer — 003 found `ProfileContainer` loading the wrong
 * person and a follow button wired to nothing, with every screen test green,
 * and 005 spent two emulator runs on navigation facts a browser settles in
 * three seconds. So this drives the real path: main screen, profile tab, edit,
 * disclosure, clear.
 *
 * It is not a substitute for the device run. react-native-web renders the same
 * components through DOM primitives, so it says nothing about native scroll or
 * touch. It makes the next device run spend its minutes on what only a device
 * can answer.
 */
describe('007/SC-003 - the feed disclosure is reachable and the reset works', () => {
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

  it('a person reaches the disclosure from the main screen and clears it', async () => {
    const author = await actor('disclosureauthor');
    const reader = await actor('disclosurereader');
    const interest = (await reader.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'learned from' });

    // Something for the feed to have learned, recorded the way the app records
    // it. A disclosure with nothing in it would pass an "is it there" check and
    // prove nothing about whether it describes anything.
    await reader.data.signals.record([
      { kind: 'open', postId },
      { kind: 'dwell', postId, dwellMs: 20_000 },
      { kind: 'save', postId },
    ]);

    page = await browser.newPage({ viewport: { width: 414, height: 896 } });
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, reader.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });

    // FROM THE MAIN SCREEN, with no deep link and no guidance: the tab bar, the
    // profile tab, the control that is already there.
    await page.waitForSelector('[data-testid="tab-profile"]', { timeout: 30_000 });
    await page.click('[data-testid="tab-profile"]');
    await page.click('[data-testid="open-edit-profile"]');

    await page.waitForSelector('[data-testid="feed-signals"]', { timeout: 30_000 });
    const summary = await page.textContent('[data-testid="feed-signals-summary"]');
    // It names the interest, in the person's own terms - not an id, not a weight.
    expect(summary).toContain(interest.name);
    const collected = await page.textContent('[data-testid="feed-signals-collected"]');
    expect(collected).toMatch(/what you save/);

    await page.click('[data-testid="clear-feed-signals"]');

    /**
     * THE STORE, not the screen. A cosmetic clear - emptying local state and
     * showing the empty copy - looks identical here, and is exactly the failure
     * FR-012 exists to forbid. Read back through the app's own data layer.
     */
    await page.waitForFunction(
      () =>
        (globalThis as unknown as { document: { querySelector(s: string): { textContent: string } | null } })
          .document.querySelector('[data-testid="feed-signals-summary"]')?.textContent
          ?.includes('has not learned') === true,
      undefined,
      { timeout: 30_000 },
    );
    const after = await reader.data.signals.disclosure();
    expect(after.interests).toEqual([]);

    await page.close();
  }, 180_000);

  /**
   * FR-010. The disclosure is the ONLY place the product explains its ranking.
   * A per-post "why am I seeing this" is the pattern the owner rejected by name,
   * and it is the thing a well-meaning later change adds to the post card.
   */
  it('no browse or post surface explains why a post was ranked', async () => {
    const author = await actor('nowhyauthor');
    const reader = await actor('nowhyreader');
    const interest = (await reader.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'no explanation' });
    await reader.data.interests.follow(interest.interestId);

    page = await browser.newPage({ viewport: { width: 414, height: 896 } });
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, reader.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="tab-feed"]', { timeout: 30_000 });
    await page.click('[data-testid="tab-feed"]');
    await page.waitForSelector(`[data-testid="post-${postId}"]`, { timeout: 30_000 });

    const feedText = (await page.textContent('[data-testid="home-feed-screen"]')) ?? '';
    for (const phrase of [/because you/i, /why (am|are) you seeing/i, /suggested for you/i, /based on your/i]) {
      expect(feedText).not.toMatch(phrase);
    }

    await page.click(`[data-testid="post-${postId}"]`);
    await page.waitForSelector('[data-testid="post-detail-screen"]', { timeout: 30_000 });
    const detailText = (await page.textContent('[data-testid="post-detail-screen"]')) ?? '';
    for (const phrase of [/because you/i, /why (am|are) you seeing/i, /based on your/i]) {
      expect(detailText).not.toMatch(phrase);
    }

    await page.close();
  }, 180_000);
});
