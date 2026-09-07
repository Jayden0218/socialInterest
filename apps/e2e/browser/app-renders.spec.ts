import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

/**
 * T102. The app's real screens, rendered in a browser, against the running API.
 *
 * The 31 render tests prove the components render from props. The 22 HTTP
 * journeys prove the data layer talks to the API. Neither proves the two work
 * together - a container binding the wrong field, or rendering an empty state
 * for a failed load, passes both. This is that gap.
 *
 * NOT a device test. No permissions, camera, photo library, backgrounding or
 * real network conditions exist here. T045 stays open.
 */
describe('browser journeys - the real UI against a live API', () => {
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
  });
  afterEach(async () => page?.close());

  it('mounts the app shell', async () => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(web.url, { waitUntil: 'networkidle' });

    // The entry point bug this feature found would show exactly this: a page
    // that loads and mounts nothing.
    await page.waitForSelector('[data-testid="app-root"]', { timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  it('renders the three tabs and switches between them', async () => {
    await page.goto(web.url, { waitUntil: 'networkidle' });
    for (const tab of ['feed', 'discover', 'notifications']) {
      await page.waitForSelector(`[data-testid="tab-${tab}"]`, { timeout: 20_000 });
    }
    // Switching tabs must swap the screen, not merely restyle a button.
    await page.click('[data-testid="tab-discover"]');
    await page.waitForSelector('[data-testid="interest-search-screen"]', { timeout: 20_000 });

    /**
     * Back to the feed, which 401s for a signed-out viewer. The container is
     * expected to render its error, NOT the feed screen and not an empty list -
     * "nothing here yet" for an unauthenticated read would be the wrong story,
     * and this is the assertion that would catch it.
     */
    await page.click('[data-testid="tab-feed"]');
    await page.waitForSelector('[data-testid="load-error"]', { timeout: 20_000 });
    await page.waitForSelector('[data-testid="home-feed-screen"]', { state: 'detached', timeout: 20_000 });
  });

  it('renders real interests fetched from the API, not a shell', async () => {
    await page.goto(web.url, { waitUntil: 'networkidle' });
    await page.click('[data-testid="tab-discover"]');

    /**
     * The assertion that matters: a name that exists only because the seeded
     * catalogue was fetched over HTTP and bound by the container. A screen
     * rendering from props, or an empty state, does not produce it - which is
     * exactly the seam neither the render tests nor the HTTP journeys cover.
     */
    await page.waitForSelector('text=Photography', { timeout: 30_000 });
    const body = (await page.textContent('body')) ?? '';
    expect(body).toContain('Photography');
    expect(body).toContain('Climbing');
  });

  it('reports a failed load as an error rather than an empty state', async () => {
    // Point the app at a dead API and confirm the container distinguishes
    // "nothing here yet" from "the request failed" - rendering the empty state
    // for a dropped connection is the mistake the container shape exists to
    // prevent, and only a rendered UI can show which one appears.
    await page.route('**/v1/interests**', (r) => r.abort());
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.click('[data-testid="tab-discover"]');
    await page.waitForSelector('[data-testid="load-error"]', { timeout: 30_000 });
  });
});
