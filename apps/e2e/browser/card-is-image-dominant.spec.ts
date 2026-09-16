import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

/**
 * 012/T014, FR-030 — THE PHOTOGRAPH IS THE DOMINANT ELEMENT OF A CARD.
 *
 * `design/012-ui/CardAnatomy.dc.html` moves the card from 47% photograph to
 * 78%, and it gets there by REMOVING: the avatar and handle come off the tile
 * entirely, and the three footer rows become two.
 *
 * MEASURED HERE AND NOT IN RNTL, and that is the whole reason this file exists
 * rather than an assertion beside the component tests. React Native Testing
 * Library performs NO LAYOUT: it can say a component mounted, never that it
 * occupies space. 008 shipped `MediaPager` collapsed to zero height with nine
 * green assertions underneath it, and 007 shipped a profile rendering
 * full-width cards in a single column while every test asserted the post was
 * present — which it was. A ratio is a layout fact, so it is measured where
 * layout happens.
 *
 * THE ASSERTION IS A FLOOR, NOT THE ARTBOARD'S NUMBER. Pinning 78% exactly
 * would fail on a caption that wraps to its second line, which is legitimate
 * and common — and a guard that fires on correct code is a guard somebody
 * switches off (`text-has-colour` accused the one file whose job was the thing
 * it checked). 65% is comfortably above the 47% this replaced and comfortably
 * below the artboard, so it catches the regression that matters: the footer
 * growing back.
 *
 * NOT RUN IN THE CLOUD SANDBOX. `publishReadyImage` uploads real bytes, and
 * MinIO publishes to quay.io which this environment's egress blocks outright.
 * This is written at the tier that can support the claim and is recorded as
 * NOT RUN rather than assumed — 012's own constraint, and Principle V.
 */
describe('012/FR-030 - the photograph dominates the card', () => {
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

  it('gives the media at least 65% of the card, and shows no byline on it', async () => {
    const me = await actor(`card${Math.random().toString(36).slice(2, 6)}`);
    const interest = (await me.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(me, [interest.interestId], {
      caption: 'Goldcrest, finally still',
    });

    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, me.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });

    const card = page.locator(`[data-testid="post-${postId}"]`);
    await card.waitFor({ state: 'visible', timeout: 30_000 });

    const cardBox = await card.boundingBox();
    const mediaBox = await page.locator(`[data-testid="post-media-${postId}"]`).boundingBox();
    if (!cardBox || !mediaBox) throw new Error('card or media has no box - it is not laid out');

    const share = mediaBox.height / cardBox.height;
    // Printed because the number is the point: a later reader wants to know
    // whether it is 0.66 or 0.78 without re-deriving it from the styles.
    console.log(`media is ${(share * 100).toFixed(1)}% of the card`);
    expect(share).toBeGreaterThan(0.65);

    /**
     * The other half of T013, and the half a ratio cannot see: an avatar
     * shrinking to nothing would satisfy the number above while leaving the
     * byline on the tile. The artboard removes it; this checks it is gone.
     */
    expect(await card.locator('[data-testid^="avatar-"]').count()).toBe(0);
  }, 180_000);
});
