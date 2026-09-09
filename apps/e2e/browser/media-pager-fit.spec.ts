import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { publishReadyImages } from '../support/publish';

/**
 * 008/US1 — THE PAGER HAS TO OCCUPY SPACE, AND NINE COMPONENT TESTS CANNOT SAY SO.
 *
 * Run 48's `23-multi-photo-post` failed on `media-pager is visible` while nine
 * `media-pager.test.tsx` assertions were green. Both were right: React Native
 * Testing Library renders the tree and performs NO LAYOUT, so a component that
 * mounts correctly and collapses to zero height passes every one of them.
 *
 * This is the same shape as the defect this whole story fixes — a thing that is
 * PRESENT and not USABLE — and the same shape as 007's profile grid, where
 * "every test asserts the post is present, and it was".
 *
 * So this measures the box. A pager whose height is zero is not a pager.
 */
describe('008/US1 the media pager occupies its frame', () => {
  let browser: Browser;
  let web: WebServer;
  let page: Page;

  beforeAll(async () => {
    web = await startWebServer(`${baseUrl()}/v1`);
    browser = await launchChromium();
  }, 300_000);

  afterAll(async () => {
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await web?.stop().catch(() => undefined);
  });

  it('renders with real width and height on the post detail surface', async () => {
    const author = await actor(`pager${Math.random().toString(36).slice(2, 8)}`);
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImages(author, [interest.interestId], 3, {
      caption: 'three to page through',
    });

    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, author.token);
    // Navigated the way a person does rather than by url, so this exercises the
    // same container the app mounts.
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="tab-profile"]', { timeout: 30_000 });
    await page.click('[data-testid="tab-profile"]');
    await page.waitForSelector(`[data-testid="post-${postId}"]`, { timeout: 30_000 });
    await page.click(`[data-testid="post-${postId}"]`);
    await page.waitForSelector('[data-testid="media-pager"]', { timeout: 30_000 });

    const box = await page.locator('[data-testid="media-pager"]').first().boundingBox();
    expect(box).not.toBeNull();
    /**
     * The assertion run 48 needed. Zero height is what a `View` with no `flex`
     * inside an `aspectRatio` frame collapses to, and it is invisible to every
     * test that does not lay anything out.
     */
    expect({ tooShort: box!.height < 100, tooNarrow: box!.width < 100 })
      .toEqual({ tooShort: false, tooNarrow: false });

    // And the pages are inside it, with real size of their own.
    const first = await page.locator('[data-testid="media-page-0"]').boundingBox();
    expect(first).not.toBeNull();
    expect({ pageTooShort: first!.height < 100 }).toEqual({ pageTooShort: false });

    // Three pages, three distinct images - the claim `media[0]` could not make.
    const images = await page.locator('[data-testid^="media-image-"]').all();
    expect(images.length).toBe(3);
  }, 300_000);
});
