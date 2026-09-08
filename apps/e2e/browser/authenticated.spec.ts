import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

/**
 * T105. Authenticated screens, rendered against a live API.
 *
 * The other browser suite covers what a signed-out visitor sees. Everything a
 * signed-in person sees - their feed, real posts, the counts on their profile -
 * had never rendered against a running server either, and that is the larger
 * half of the app.
 *
 * The token is placed in localStorage under the key PersistentTokenStore reads,
 * which is exactly how a returning person is signed in. That makes this a test
 * of the persistence path too: if the store stopped reading it, these fail.
 */
describe('browser journeys - signed in', () => {
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

  async function signIn(token: string): Promise<void> {
    // Seed before any app code runs, so the first render is already signed in -
    // the same state a returning person starts in.
    // `globalThis`, not `window`: this package is typed for Node, and the script
    // itself is serialised and run in the page.
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } }).localStorage.setItem(
        'sih.auth.token',
        t as string,
      );
    }, token);
  }

  it('a signed-in person sees their followed-interest posts in the feed', async () => {
    const author = await actor('webfeedauthor');
    const reader = await actor('webfeedreader');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    await publishReadyImage(author, [interest.interestId], { caption: 'rendered in a browser' });
    await reader.data.interests.follow(interest.interestId);

    await signIn(reader.token);
    await page.goto(web.url, { waitUntil: 'networkidle' });

    // The caption only reaches the DOM if the token was read from storage, the
    // request was authenticated, the feed was composed from followed interests,
    // and the container bound the result. No render test or HTTP journey covers
    // that whole chain.
    await page.waitForSelector('[data-testid="home-feed-screen"]', { timeout: 30_000 });
    await page.waitForSelector('text=rendered in a browser', { timeout: 30_000 });
  });

  /**
   * REWRITTEN FOR THE RANKED FEED (007/RS-003, RS-008).
   *
   * This asserted 001/FR-033's negative case: a post in an unfollowed interest
   * must be ABSENT from the rendered feed. That requirement is withdrawn, and
   * the replacement is not a softer version — the ranked feed draws candidates
   * across the catalogue, so reaching an undeclared interest is required
   * (FR-007) rather than merely tolerated.
   *
   * What survives, and is worth asserting IN A BROWSER rather than over HTTP,
   * is that a declared interest's post RENDERS and renders FIRST. The journeys
   * assert the ordering through the data layer; this asserts that the ordering
   * survives all the way to the DOM, which is the chain 002 showed can be
   * broken while every HTTP assertion passes.
   */
  it('renders the ranked order, with a declared interest first (FR-030)', async () => {
    const author = await actor('webnofollowauthor');
    const reader = await actor('webnofollowreader');
    const tops = await author.data.interests.listTop({ limit: 2 });
    const declared = tops.items[0]!;
    const other = tops.items[1]!;

    await publishReadyImage(author, [declared.interestId], { caption: 'in a declared interest' });
    // Published AFTER, so recency alone would put it first and the declaration
    // has something to overturn.
    await publishReadyImage(author, [other.interestId], { caption: 'not declared' });
    await reader.data.interests.follow(declared.interestId);

    await signIn(reader.token);
    await page.goto(web.url, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=in a declared interest', { timeout: 30_000 });

    const body = (await page.textContent('body')) ?? '';
    const declaredAt = body.indexOf('in a declared interest');
    const otherAt = body.indexOf('not declared');
    expect(declaredAt).toBeGreaterThanOrEqual(0);
    // If the other post is on the page at all, it must be below. Its presence is
    // not required — exploration re-samples per request, and demanding a
    // specific post from a random draw would be asserting luck.
    if (otherAt >= 0) expect(declaredAt).toBeLessThan(otherAt);
  });

  it('keeps the person signed in across a reload', async () => {
    const person = await actor('webpersist');
    await signIn(person.token);

    await page.goto(web.url, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="home-feed-screen"]', { timeout: 30_000 });

    // A reload with no re-seeding: only a persisted token gets us back in.
    // Before PersistentTokenStore existed, this rendered the signed-out error.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="home-feed-screen"]', { timeout: 30_000 });
  });
});
