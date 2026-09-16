import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { freshInterestName, publishReadyNamingInterest } from '../support/publish';

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
     * expected to render its FAILED state, NOT the feed screen and not an empty
     * list — "nothing here yet" for an unauthenticated read would be the wrong
     * story, and this is the assertion that would catch it.
     *
     * 012. THE ID MOVED AND THIS TEST DID NOT. It waited for `load-error`, the
     * shared `Failed` component's id; 012 gave the feed and Explore their own
     * named states through `surfaceFallback`, so the feed's failure is
     * `feed-failed` and Explore's is `discover-failed`. `load-error` still
     * exists and twelve containers still render it — which is exactly why this
     * did not fail as a missing symbol. It failed as a thirty-second timeout,
     * on CI, against a product that was working.
     */
    await page.click('[data-testid="tab-feed"]');
    await page.waitForSelector('[data-testid="feed-failed"]', { timeout: 20_000 });
    /**
     * AND NOT THE EMPTY STATE. That is the assertion that survives 012; the one
     * it replaces — `home-feed-screen` DETACHED — asserted the old shape rather
     * than the guarantee.
     *
     * 012's `surfaceFallback` deliberately renders the state INSIDE the screen
     * rather than instead of it: an early return took the chrome with it, so an
     * empty feed lost the very control that would stop it being empty. The
     * screen staying mounted is the fix, not a regression, and "the failure is
     * distinguishable from emptiness" is what this test was always for.
     */
    expect(await page.locator('[data-testid="feed-empty"]').count()).toBe(0);
  });

  it('renders real interests fetched from the API, not a shell', async () => {
    /**
     * 013. THE INTERESTS ARE CREATED HERE, because there is no catalogue to
     * assume any more.
     *
     * This waited for the literal words `Photography` and `Climbing`, "a name
     * that exists only because the seeded catalogue was fetched over HTTP" —
     * and 013 deleted the curated twelve. On a reset store there are now no
     * interests at all until somebody publishes, so the wait could only ever
     * time out. The seam it covers is real and unchanged; what it may assume
     * about the world is not.
     *
     * The names are per-run and high-entropy for the reason
     * `interest-merge.spec.ts` records: FR-008 compares a proposed name against
     * EVERY interest, and two names differing by one character are refused.
     */
    const author = await actor('rendersinterests');
    const first = await publishReadyNamingInterest(author, freshInterestName('Photography'));
    const second = await publishReadyNamingInterest(author, freshInterestName('Climbing'));
    const one = (await author.data.interests.get(first.interestId)).name;
    const two = (await author.data.interests.get(second.interestId)).name;

    await page.goto(web.url, { waitUntil: 'networkidle' });
    await page.click('[data-testid="tab-discover"]');

    /**
     * The assertion that matters: a name that exists only because it was
     * fetched over HTTP and bound by the container. A screen rendering from
     * props, or an empty state, does not produce it — which is exactly the seam
     * neither the render tests nor the HTTP journeys cover.
     *
     * TYPED INTO THE SEARCH FIELD rather than read off the initial list: Explore
     * lists a bounded page of a flat catalogue that every other journey in this
     * suite also writes to, so "is it on the first page" is a question about how
     * many interests the run happened to create. Searching for a name this test
     * created asks the question it means to ask.
     */
    await page.fill('[data-testid="interest-search-input"]', one);
    await page.waitForSelector(`text=${one}`, { timeout: 30_000 });
    expect((await page.textContent('body')) ?? '').toContain(one);

    await page.fill('[data-testid="interest-search-input"]', two);
    await page.waitForSelector(`text=${two}`, { timeout: 30_000 });
    expect((await page.textContent('body')) ?? '').toContain(two);
  });

  it('reports a failed load as an error rather than an empty state', async () => {
    // Point the app at a dead API and confirm the container distinguishes
    // "nothing here yet" from "the request failed" - rendering the empty state
    // for a dropped connection is the mistake the container shape exists to
    // prevent, and only a rendered UI can show which one appears.
    await page.route('**/v1/interests**', (r) => r.abort());
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.click('[data-testid="tab-discover"]');
    // 012: Explore's own failed state, not the shared `load-error`. See the
    // note in the tab test above for why the rename did not fail loudly.
    await page.waitForSelector('[data-testid="discover-failed"]', { timeout: 30_000 });
    // And it is NOT the empty state: "nothing to explore yet" for a dropped
    // connection is the exact confusion this test exists to catch, and 012 made
    // the two different elements rather than one message.
    expect(await page.locator('[data-testid="discover-empty"]').count()).toBe(0);
  });
});
