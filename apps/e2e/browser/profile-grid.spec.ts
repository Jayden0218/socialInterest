import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

/**
 * 007/T051 — A PROFILE IS A GRID, and run 46's device capture is why this test
 * exists at all.
 *
 * `design/007-ui/Profile.dc.html` specifies three columns of square tiles two
 * points apart. The profile SHIPPED rendering full-width `PostCard`s in a
 * single column: I built the screen's header, marked T051 done, and left the
 * content area as the list it had been. Every test asserted the post was
 * PRESENT — and it was, one per row, edge to edge.
 *
 * "Present" is the assertion that let this through, so this one measures SHAPE:
 * three tiles sharing a row at three distinct x positions. A single-column list
 * has one x and fails.
 */
describe('007/T051 - the profile posts are a grid, not a column', () => {
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

  it('renders three tiles across', async () => {
    const me = await actor(`grid${Math.random().toString(36).slice(2, 6)}`);
    const interest = (await me.data.interests.listTop({ limit: 1 })).items[0]!;
    const ids: string[] = [];
    /**
     * SEVEN, not six, and the odd one is the point.
     *
     * Six fills two exact rows and passes over the defect run 47's capture
     * showed: with `numColumns` and a `flex: 1` tile, a trailing row holding ONE
     * item gives it the WHOLE row, so the profile rendered two neat rows and
     * then a tile stretched edge to edge. A count that divides evenly never
     * produces a trailing row, so it could never see it - and two thirds of all
     * counts do produce one.
     */
    for (let i = 0; i < 7; i++) {
      ids.push(await publishReadyImage(me, [interest.interestId], { caption: `grid ${i}` }));
    }

    page = await browser.newPage({ viewport: { width: 320, height: 640 } });
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, me.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="tab-profile"]', { timeout: 30_000 });
    await page.click('[data-testid="tab-profile"]');
    await page.waitForSelector(`[data-testid="post-${ids[0]}"]`, { timeout: 30_000 });

    const boxes = (
      await Promise.all(
        ids.map((id) => page.locator(`[data-testid="post-${id}"]`).boundingBox()),
      )
    ).filter((b): b is NonNullable<typeof b> => b !== null);

    expect(boxes.length).toBeGreaterThanOrEqual(7);

    // THREE DISTINCT COLUMNS. A single-column list yields one x for every tile,
    // which is exactly the shape that shipped.
    const columns = new Set(boxes.map((b) => Math.round(b.x)));
    expect({ columns: [...columns].sort((a, b) => a - b), count: columns.size })
      .toMatchObject({ count: 3 });

    // And SQUARE, not the card's own aspect ratio - the tile is the artboard's
    // unit and a 4:5 photograph must be cropped to it, not laid out by it.
    for (const b of boxes) {
      expect({ w: Math.round(b.width), h: Math.round(b.height), square: Math.abs(b.width - b.height) < 2 })
        .toMatchObject({ square: true });
    }

    /**
     * EVERY tile is the same width, INCLUDING the one alone in the last row.
     * That is the assertion the six-post version could not make, and it is the
     * one that fails on the stretched trailing tile: it would be three times
     * the width of its neighbours.
     */
    const widths = new Set(boxes.map((b) => Math.round(b.width)));
    expect({ widths: [...widths], distinct: widths.size }).toMatchObject({ distinct: 1 });

    await page.close();
  }, 240_000);
});
