import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

describe('measure the fold', () => {
  let browser: Browser; let web: WebServer; let page: Page;
  beforeAll(async () => { web = await startWebServer(`${baseUrl()}/v1`); browser = await launchChromium(); }, 120_000);
  afterAll(async () => { await browser?.close(); await web?.stop(); });

  it('reports card boxes at 360x640', async () => {
    const author = await actor('measureauthor');
    const reader = await actor('measurereader');
    const interest = (await reader.data.interests.listTop({ limit: 1 })).items[0]!;
    for (let i = 0; i < 8; i++) await publishReadyImage(author, [interest.interestId], { caption: `m ${i}` });
    await reader.data.interests.follow(interest.interestId);

    page = await browser.newPage({ viewport: { width: 360, height: 640 } });
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, reader.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="home-feed-screen"]', { timeout: 30_000 });
    await page.waitForSelector('[data-testid^="post-01"]', { timeout: 30_000 });

    const list = await page.locator('[data-testid="paged-post-list"]').boundingBox();
    console.log('LIST BOX', JSON.stringify(list));
    const cards = await page.locator('[data-testid^="post-01"]').all();
    for (const c of cards) {
      const b = await c.boundingBox();
      console.log('CARD', JSON.stringify(b));
    }
    await page.close();
  }, 240_000);
});
