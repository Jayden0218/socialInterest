import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { anInterest } from '../support/interests';
import { publishReadyImage } from '../support/publish';
import { jpegPlain } from '../support/media';

/**
 * 012/T031, FR-006a. DOES A PHOTOGRAPH ACTUALLY ARRIVE, AND DO ITS STATES DIFFER?
 *
 * T031 asks a question rather than asserting a fact: "determine whether images
 * load at all. They render as grey boxes in this sandbox because object storage
 * is unreachable here, and that is an artefact — if they are grey on a real
 * device too, that is 006/R4b's media defect in a third place."
 *
 * This answers the first half. Object storage IS reachable now (see the run
 * record), so a post published here carries real bytes behind a presigned url,
 * and the assertion is that the app fetches them and the frame stops being a
 * placeholder. What it does NOT answer is the device half: react-native-web
 * fetches an `<img>` where React Native fetches through its own image loader,
 * and 006's `Avatar` overflow is the standing reminder that those differ.
 *
 * The second test is T025's question for an image rather than a screen: a
 * person who has not been told which is which must be able to tell the three
 * apart. Asserted as three DIFFERENT elements, because "they look different" is
 * a claim about pixels and this is a claim about what is drawn.
 */
describe('a photograph loads, and its states are not one grey box', () => {
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

  // `globalThis`, not `window`: this package is typed for Node and the script is
  // serialised and run in the page. Key and reasoning both from
  // `authenticated.spec.ts`, which is the one place that knew them.
  /** Explore → type the name → open the space. The path a person takes. */
  const openInterestSpace = async (name: string): Promise<void> => {
    await page.waitForSelector('[data-testid="tab-discover"]', { timeout: 30_000 });
    await page.click('[data-testid="tab-discover"]');
    await page.fill('[data-testid="interest-search-input"]', name);
    await page.waitForSelector('[data-testid="search-result-0"]', { timeout: 30_000 });
    await page.click('[data-testid="search-result-0"]');
    await page.waitForSelector('[data-testid="interest-screen"]', { timeout: 30_000 });
  };

  const open = async (token: string): Promise<void> => {
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } }).localStorage.setItem(
        'sih.auth.token',
        t as string,
      );
    }, token);
  };

  it('T031 the bytes reach the app: the placeholder goes away and the store serves a photograph', async () => {
    const author = await actor('photoloads');
    const interest = await anInterest(author);
    const postId = await publishReadyImage(author, [interest.interestId], {
      caption: 'a real photograph',
      bytes: jpegPlain(),
    });

    /**
     * THE INTEREST SPACE, NOT THE FEED — and the reason is a dependency this
     * test never needed.
     *
     * It opened the home feed, which is RANKED: whether a particular post is on
     * the first page is a question about ranking and about how much else the
     * shared store holds, not about whether its photograph loads. It passed
     * alone and failed once in a full run; that one failure's cause was NOT
     * observed and is not being given a story here. What is observable by
     * reading is that an interest space lists by RECENCY and contains this post
     * by construction, so the fixture stops depending on something irrelevant to
     * what it asserts.
     *
     * Reached by SEARCHING for it, because the app routes on a hash only for
     * `#/p/<postId>` — `App.tsx` matches that one pattern and nothing else, so
     * `#/interest/<id>` would just open the feed and the wait would be a
     * thirty-second lie. Checked rather than assumed.
     */
    await open(author.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await openInterestSpace(interest.name);
    await page.waitForSelector(`[data-testid="post-${postId}"]`, { timeout: 30_000 });

    const img = page.locator(`[data-testid="post-image-${postId}"]`).first();
    await img.waitFor({ timeout: 30_000 });

    /**
     * `naturalWidth` CANNOT BE USED HERE, and the first version of this test
     * used it anyway.
     *
     * react-native-web does not render an `<img>`. It renders a `<div>` holding
     * another `<div>` with a CSS `background-image` — measured, not assumed:
     *
     *   <div data-testid="post-image-01M2..." style="width:100%;height:100%">
     *     <div class="r-backgroundColor-... r-backgroundPosition-..." />
     *
     * so `naturalWidth` is `undefined` on every one of them and the wait could
     * only ever time out. It is the same shape as "a soft keyboard cannot be
     * measured in a browser": an assertion written from what the DOM usually
     * looks like rather than from what this renderer produces.
     *
     * TWO THINGS ARE ASSERTABLE HERE AND BOTH ARE STRONGER.
     *
     * 1. THE PLACEHOLDER GOING AWAY. react-native-web fires `onLoad` only after
     *    it has preloaded and decoded the bytes, so the placeholder detaching is
     *    the app itself reporting that the photograph arrived — which is exactly
     *    the state machine FR-006a adds, proving itself.
     */
    await page.waitForSelector(`[data-testid="post-image-${postId}-loading"]`, {
      state: 'detached',
      timeout: 30_000,
    });

    /**
     * 2. AND THE BYTES, FETCHED FROM THE PAGE with the url the app is using.
     *    This is T031's actual question — "determine whether images load at
     *    all" — and it is answered against the presigned url the API issued for
     *    this viewer, not against a url this test made up.
     */
    const url = await page.evaluate((id) => {
      const doc = (globalThis as unknown as {
        document: { querySelector(s: string): { querySelector(s: string): unknown } | null };
        getComputedStyle(el: unknown): { backgroundImage: string };
      }).document;
      const frame = doc.querySelector(`[data-testid="post-image-${id as string}"]`);
      const inner = frame?.querySelector('div') ?? null;
      if (!inner) return null;
      const css = (globalThis as unknown as {
        getComputedStyle(el: unknown): { backgroundImage: string };
      }).getComputedStyle(inner).backgroundImage;
      const m = /url\("?(.+?)"?\)/.exec(css);
      return m ? m[1]! : null;
    }, postId);
    expect(url).toMatch(/^http/);

    const res = await page.request.get(url!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image');
    // Bytes, not a zero-length 200 — the difference between "the store answered"
    // and "the store answered with a photograph".
    expect((await res.body()).byteLength).toBeGreaterThan(0);
  }, 240_000);

  it('SC-008 a refused photograph is told apart from one that is still arriving', async () => {
    const author = await actor('photofails');
    const interest = await anInterest(author);
    const postId = await publishReadyImage(author, [interest.interestId], {
      caption: 'this one will be refused',
    });

    // Refuse the MEDIA only. The post itself still loads, so the card is on
    // screen and the only thing missing is the photograph — which is the case
    // a person actually meets on a bad connection.
    await page.route('**/sih-media/**', (r) => r.abort());

    await open(author.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await openInterestSpace(interest.name);
    await page.waitForSelector(`[data-testid="post-${postId}"]`, { timeout: 30_000 });

    const failed = page.locator(`[data-testid="post-image-${postId}-failed"]`).first();
    await failed.waitFor({ timeout: 30_000 });

    // Three states, three different elements: the failure is up, the
    // placeholder is not, and the image is not.
    expect(await page.locator(`[data-testid="post-image-${postId}-loading"]`).count()).toBe(0);
    expect(await page.locator(`[data-testid="post-image-${postId}"]`).count()).toBe(0);
    // FR-003: and it offers a way out rather than only a report.
    expect(await page.locator(`[data-testid="post-image-${postId}-retry"]`).count()).toBeGreaterThan(0);
  }, 240_000);
});
