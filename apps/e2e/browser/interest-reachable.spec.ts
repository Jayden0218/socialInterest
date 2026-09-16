import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { freshInterestName, publishReadyImage, publishReadyNamingInterest } from '../support/publish';
import { anInterest } from '../support/interests';

/**
 * ===========================================================================
 * 007 GATE G2 — INTEREST IS STILL HOW YOU FIND THINGS.
 * ===========================================================================
 *
 * The constitution's Principle I survives 007 by saying that every post is
 * FILED under an interest and every space is BROWSED by one, even though the
 * feed is no longer assembled from them. That is a promise about navigation,
 * and navigation is exactly what a component test cannot answer.
 *
 * The failure it guards is not hypothetical and has happened twice in this
 * repository, both times in the same shape: a thing was rendered as bare text,
 * so the screen that named it was the only screen that could reach it and could
 * not. 004 found it for places on the post detail screen. 007 found it for
 * interests, on the same screen, where the interest was rendered as accent text
 * with no press handler at all.
 *
 * A ranked feed that also strands the taxonomy leaves it vestigial, which is
 * precisely the failure Principle I names. So this walks the route a person
 * walks: card → interest space, and post → interest space.
 */
describe('007/G2 - the interest space is reachable from a post', () => {
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

  const id = (testID: string) => `[data-testid="${testID}"]`;

  async function open(token: string): Promise<void> {
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', (err) => console.log('page error:', err.message));
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(id('tab-feed'), { timeout: 30_000 });
  }

  it('one tap from a feed card opens the interest space, and it lists the post', async () => {
    const author = await actor('g2author');
    const reader = await actor('g2reader');
    const interest = await anInterest(reader);
    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'g2 from the feed' });
    await reader.data.interests.follow(interest.interestId);

    await open(reader.token);
    await page.click(id('tab-feed'));
    await page.waitForSelector(id(`post-${postId}`), { timeout: 30_000 });

    // The coloured word on the card. ONE tap, from the feed, with no detour
    // through search — which is the difference between a taxonomy that
    // organises the product and one that is only a filing cabinet.
    await page.click(`${id(`post-${postId}`)} ${id(`interest-chip-${interest.slug}`)}`);
    await page.waitForSelector(id('interest-screen'), { timeout: 30_000 });

    // And it is THAT interest's space, holding that post — not merely a screen
    // that opened. A route to the wrong interest looks identical here.
    await page.waitForSelector(id(`post-${postId}`), { timeout: 30_000 });
    const text = (await page.textContent(id('interest-screen'))) ?? '';
    expect(text).toContain(interest.name);

    await page.close();
  }, 240_000);

  it('the post detail screen reaches it too, which it could not before 007', async () => {
    const author = await actor('g2dauthor');
    const reader = await actor('g2dreader');
    const interest = await anInterest(reader);
    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'g2 from detail' });
    await reader.data.interests.follow(interest.interestId);

    await open(reader.token);
    await page.click(id('tab-feed'));
    await page.waitForSelector(id(`post-${postId}`), { timeout: 30_000 });
    await page.click(id(`post-${postId}`));
    await page.waitForSelector(id('post-detail-screen'), { timeout: 30_000 });

    // It was bare accent-coloured text here: named on the one screen that names
    // it, and unreachable from it.
    await page.click(`${id('post-interests')} ${id(`interest-chip-${interest.slug}`)}`);
    await page.waitForSelector(id('interest-screen'), { timeout: 30_000 });

    await page.close();
  }, 240_000);

  /**
   * 013/FR-021. REPLACES "the space lists a sub-interest post and says where it
   * came from".
   *
   * That test drove 001/FR-024's roll-up — a parent space showing a child's
   * posts — and the roll-up is WITHDRAWN: interests are flat, so there is no
   * parent to roll up into and nothing to explain on the page. Removing it
   * outright would have taken the navigational guarantee with it, so what it is
   * replaced by is the same guarantee for the product that exists now: an
   * interest A PERSON NAMED is findable by searching for it, and its space
   * holds the post that created it.
   *
   * That is worth a browser rather than a request, for the reason at the top of
   * this file: an interest nobody can navigate TO is the defect this gate
   * exists for, and 013 is precisely the change that makes every interest a
   * person-named one.
   */
  it('an interest a person named is findable by search, and its space holds the post', async () => {
    const author = await actor('g2nameauthor');
    const reader = await actor('g2namereader');
    const named = await publishReadyNamingInterest(author, freshInterestName('Gliding'), {
      caption: 'g2 in an interest somebody named',
    });
    // The name the server settled on, rather than the one that was sent: a
    // resolve may have landed on an existing interest, and searching for the
    // typed name would then look for something nothing is called.
    const interest = await reader.data.interests.get(named.interestId);

    await open(reader.token);
    await page.goto(`${web.url}#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(id('tab-discover'), { timeout: 30_000 });
    await page.click(id('tab-discover'));
    await page.fill(id('interest-search-input'), interest.name);
    await page.waitForSelector(id('search-result-0'), { timeout: 30_000 });
    await page.click(id('search-result-0'));
    await page.waitForSelector(id('interest-screen'), { timeout: 30_000 });

    await page.waitForSelector(id(`post-${named.postId}`), { timeout: 30_000 });

    await page.close();
  }, 240_000);
});
