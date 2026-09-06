import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

/**
 * The screens that were unreachable, driven against a running API.
 *
 * Wiring the shell was checked by navigation.test.tsx, which renders against a
 * fake data layer. That proves the edges between screens exist; it cannot prove
 * any of them works, because nothing behind them makes a request. Sign-in, the
 * interest space, compose and profile had never once run against a real server.
 *
 * That gap is the shape of every defect this project has found: the contract
 * mismatch, the cross-user media key, the missing token on optional-auth, the
 * unsubscribed post.created, the interestFollowCount that stayed 0 - all of them
 * passed every test that used a fixture and failed the first real request. So
 * these journeys use no fakes: a real API, real posts, and the app's own screens
 * rendered in a browser.
 *
 * Sign-in here goes THROUGH the screen, unlike authenticated.spec.ts which seeds
 * the token to test the persistence path. Both matter, and they are not the same
 * check: seeding proves the store is read, typing proves a person can get in.
 */
describe('browser journeys - the screens the shell could not reach', () => {
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
    // A crash in a screen leaves a blank page and an otherwise silent failure,
    // which is how the unhydrated post response hid: every selector simply
    // timed out. Surfacing page errors makes the next one say what it was.
    page.on('pageerror', (err) => {
      // eslint-disable-next-line no-console
      console.log('page error:', err.message);
    });
  });
  afterEach(async () => page?.close());

  const id = (testID: string) => `[data-testid="${testID}"]`;

  async function signInThroughTheScreen(token: string): Promise<void> {
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.click(id('open-sign-in'));
    await page.fill(id('sign-in-token'), token);
    await page.click(id('sign-in-submit'));
    // The sign-in screen closing is the assertion: signIn calls GET /v1/me with
    // the token before storing it, so this only happens if the API accepted it.
    await page.waitForSelector(id('sign-in-screen'), { state: 'detached', timeout: 20_000 });
  }

  it('J-01 a person signs in by typing a token, and the API accepts it', async () => {
    const person = await actor('websignin');
    await signInThroughTheScreen(person.token);

    // Signed in, so the sign-in affordance is gone and the profile tab resolves.
    expect(await page.$(id('open-sign-in'))).toBeNull();
    await page.click(id('tab-profile'));
    await page.waitForSelector(id('profile-screen'), { timeout: 20_000 });
  });

  it('a token the API rejects is reported, not silently stored', async () => {
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.click(id('open-sign-in'));
    await page.fill(id('sign-in-token'), 'not-a-real-token');
    await page.click(id('sign-in-submit'));

    await page.waitForSelector(id('sign-in-error'), { timeout: 20_000 });
    // Still on the sign-in screen: a rejected token must never look like success.
    expect(await page.$(id('sign-in-screen'))).not.toBeNull();
  });

  it('J-03/J-07 discover opens an interest space, and following it sticks', async () => {
    const person = await actor('webfollow');
    const catalogue = await person.data.interests.listTop({ limit: 1 });
    const target = catalogue.items[0];
    expect(target).toBeDefined();

    await signInThroughTheScreen(person.token);
    await page.click(id('tab-discover'));
    await page.fill(id('interest-search-input'), target!.name.slice(0, 4));
    await page.waitForSelector(id('search-result-0'), { timeout: 20_000 });
    await page.click(id('search-result-0'));

    // The interest space is a screen nothing could reach before this session.
    await page.waitForSelector(id('interest-screen'), { timeout: 20_000 });
    await page.click(id('follow-toggle'));

    // FR-034: the server owns the follow, so re-reading it from the API is what
    // proves the tap did something. A control that flipped locally and lost the
    // request would pass a DOM-only assertion.
    await page.waitForTimeout(1_000);
    const me = await person.data.session.me();
    expect(me.interestFollowCount).toBeGreaterThan(0);
  });

  it('J-08 a comment typed on screen reaches the server', async () => {
    const author = await actor('webcommentauthor');
    const reader = await actor('webcommentreader');
    const catalogue = await author.data.interests.listTop({ limit: 1 });
    const interestId = catalogue.items[0]!.interestId;
    await author.data.interests.follow(interestId);
    await reader.data.interests.follow(interestId);
    const postId = await publishReadyImage(author, [interestId], { caption: 'comment me' });

    await signInThroughTheScreen(reader.token);
    await page.click(id('tab-feed'));
    await page.waitForSelector(id(`post-${postId}`), { timeout: 30_000 });
    await page.click(id(`post-${postId}`));

    await page.waitForSelector(id('open-comments'), { timeout: 20_000 });
    await page.click(id('open-comments'));
    await page.waitForSelector(id('comments-screen'), { timeout: 20_000 });
    await page.fill(id('comment-input'), 'left from a browser');
    await page.click(id('comment-submit'));

    // Read it back from the API, not from the DOM: the point is that it landed.
    await page.waitForTimeout(1_500);
    const comments = await reader.data.engagement.comments(postId, {});
    expect(comments.items.map((c) => c.body)).toContain('left from a browser');
  });

  it('J-09/J-10 report and block are reachable, and Block knows whose post it is', async () => {
    const author = await actor('websafetyauthor');
    const reader = await actor('websafetyreader');
    const catalogue = await author.data.interests.listTop({ limit: 1 });
    const interestId = catalogue.items[0]!.interestId;
    await author.data.interests.follow(interestId);
    await reader.data.interests.follow(interestId);
    const postId = await publishReadyImage(author, [interestId], { caption: 'report me' });

    await signInThroughTheScreen(reader.token);
    await page.click(id('tab-feed'));
    await page.waitForSelector(id(`post-${postId}`), { timeout: 30_000 });
    await page.click(id(`post-${postId}`));
    await page.waitForSelector(id('open-safety'), { timeout: 20_000 });
    await page.click(id('open-safety'));

    await page.waitForSelector(id('safety-actions'), { timeout: 20_000 });
    // Block renders only when the author's handle reached SafetyActions
    // (FR-044). It did not until this session, so blocking was unreachable on
    // every surface - this assertion is the regression guard for that.
    expect(await page.$(id('block-person'))).not.toBeNull();
  });
});
