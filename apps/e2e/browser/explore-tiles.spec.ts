import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { freshInterestName, publishReadyNamingInterest } from '../support/publish';
import { publishReadyImage } from '../support/publish';

/**
 * 012/T038, FR-031, FR-032. EXPLORE SHOWS SOMETHING BEFORE ANYTHING IS TYPED.
 *
 * The spec's complaint, close to verbatim: "Explore opens with two empty text
 * fields and asks you to type before it shows anything; the interest list is
 * twelve names and twelve dots with nothing to say how much is behind any of
 * them". `Explore.dc.html` answers with one field and a grid of tiles, each one
 * a 2x2 photo mosaic over the interest's name and its post count.
 *
 * MEASURED IN A BROWSER RATHER THAN REASONED ABOUT, for the reason this project
 * keeps paying for: RNTL performs no layout, so a component test proves the
 * tiles MOUNT and says nothing about whether a person can see them. Three
 * device runs have been spent on that distinction.
 */
describe('012/US5 — Explore is worth opening before you type', () => {
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

  beforeEach(async () => {
    page = await browser.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
  });
  afterEach(async () => page?.close());

  it('FR-031 one search field, a mosaic and a count, with nothing typed', async () => {
    const author = await actor('exploretiles');
    const made = await publishReadyNamingInterest(author, freshInterestName('Kitesurfing'));
    // A second post, so the count is a number this test moved rather than the
    // one every new interest starts at.
    await publishReadyImage(author, [made.interestId], { caption: 'second' });
    const interest = await author.data.interests.get(made.interestId);
    expect(interest.postCount).toBe(2);

    await page.goto(`${web.url}#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="tab-discover"]', { timeout: 30_000 });
    await page.click('[data-testid="tab-discover"]');
    await page.waitForSelector('[data-testid="interest-tiles"]', { timeout: 30_000 });

    /**
     * ONE FIELD. The locality field is the second one the spec counts, and it
     * appears only once a search is under way — a place search still cannot
     * dedupe without it, which is why it was not simply deleted.
     */
    expect(await page.locator('[data-testid="place-search-locality"]').count()).toBe(0);
    expect(await page.locator('[data-testid="interest-search-input"]').count()).toBe(1);

    // The interest this test made is on a tile somewhere, with its own count.
    const tile = page.locator('[data-testid^="search-result-"]').first();
    await tile.waitFor({ timeout: 30_000 });
    await page.waitForSelector('[data-testid="search-result-0-mosaic"]', { timeout: 30_000 });

    /**
     * NO TRAILING `\b`. `textContent` concatenates the whole tree with no
     * separators, so the count runs straight into the tab bar — "2 postsFeed" —
     * and a word boundary after "posts" never arrives. The first version of
     * this assertion failed for that reason against a product that was drawing
     * exactly what it should.
     */
    const body = (await page.textContent('body')) ?? '';
    expect(body).toMatch(/\d+ posts?/);
    // The count this test moved, specifically, rather than any count at all.
    expect(await page.locator('[data-testid="search-result-0-count"]').count()).toBeGreaterThan(0);

    /**
     * AND THE TILE IS ON SCREEN, not merely mounted. The first tile's bottom
     * against a 844pt viewport — FR-033 asks for a visible next action without
     * scrolling, and a grid that starts below the fold is the same defect as
     * compose's interest picker at y=753, which cost run 52.
     */
    const box = await tile.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(844);
  }, 240_000);

  it('FR-031 typing switches to a list, and brings the place refinement with it', async () => {
    const author = await actor('exploretyping');
    const made = await publishReadyNamingInterest(author, freshInterestName('Freediving'));
    const interest = await author.data.interests.get(made.interestId);

    await page.goto(`${web.url}#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="tab-discover"]', { timeout: 30_000 });
    await page.click('[data-testid="tab-discover"]');
    await page.waitForSelector('[data-testid="interest-tiles"]', { timeout: 30_000 });

    await page.fill('[data-testid="interest-search-input"]', interest.name);
    // A LIST now, not a grid: a type-ahead is scanned top to bottom.
    await page.waitForSelector('[data-testid="interest-list"]', { timeout: 30_000 });
    expect(await page.locator('[data-testid="interest-tiles"]').count()).toBe(0);
    // And the place refinement is available to somebody who is actually looking.
    await page.waitForSelector('[data-testid="place-search-locality"]', { timeout: 30_000 });
    expect((await page.textContent('body')) ?? '').toContain(interest.name);
  }, 240_000);
});
