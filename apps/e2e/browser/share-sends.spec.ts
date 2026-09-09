import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

/**
 * 008/US4 — WHAT HAPPENS AFTER THE SEND, MEASURED RATHER THAN ASSUMED.
 *
 * Emulator run 50 failed `26-send-post` on its last step: the share screen was
 * still there 30 seconds after the recipient was tapped. The whole-run aggregate
 * shows the send SUCCEEDING - `PUT /v1/conversations/with/:handle` 200 and
 * `POST /v1/conversations/:id/messages` 201, with no 4xx anywhere in the run -
 * so "the send was refused" does not fit the evidence, and neither does the
 * neutral error banner, which the flow had already asserted absent.
 *
 * That leaves a question a 40-minute device run is a terrible instrument for:
 * does the screen actually go away when the send resolves? `ShareContainer` is
 * a PUSHED screen and calls `onDone` (which is `pop`) on success. This drives
 * exactly that, over react-native-web against a real API, in seconds.
 *
 * The same argument as `browser/media-pager-fit.spec.ts`, which reproduced run
 * 48's invisible pager in 38 seconds where the emulator took 36 minutes to say
 * "not visible": prefer the free observation to the expensive guess.
 */
describe('008/US4 the share screen after a send', () => {
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

  it('closes when the post reaches somebody never messaged (FR-011)', async () => {
    const sender = await actor('shsender');
    /**
     * A SECOND person, and the recipient search is run as the sender.
     * `PersonSearchService` excludes the viewer from their own results, so a
     * flow that "sends to itself" finds nobody - which is what the device flow's
     * own comment claims it does, and cannot.
     */
    const recipient = await actor('shrecipient');
    const interest = (await sender.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(sender, [interest.interestId], {
      caption: 'a post that travels',
    });

    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const failures: string[] = [];
    // 007's second defect was invisible until somebody listened for it: every
    // browser journey timed out with no reason given while the feed threw on
    // its second render.
    page.on('pageerror', (e) => failures.push(String(e)));
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, sender.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(id('tab-feed'), { timeout: 30_000 });

    await page.click(id('tab-profile'));
    await page.waitForSelector(id(`post-${postId}`), { timeout: 30_000 });
    await page.click(id(`post-${postId}`));
    await page.waitForSelector(id('post-detail-screen'), { timeout: 30_000 });

    await page.click(id('share-button'));
    await page.waitForSelector(id('share-action'), { timeout: 30_000 });
    await page.waitForSelector(id('share-to-person'), { timeout: 30_000 });

    await page.fill(id('share-recipient-search'), recipient.handle.slice(0, 6));
    await page.waitForSelector(id(`share-person-${recipient.handle}`), { timeout: 30_000 });
    await page.click(id(`share-person-${recipient.handle}`));

    // THE ASSERTION THE DEVICE MADE, and the one that failed there.
    await page
      .waitForSelector(id('share-action'), { state: 'detached', timeout: 15_000 })
      .catch(() => undefined);

    const stillOpen = await page.locator(id('share-action')).count();
    const errorShown = await page.locator(id('share-send-error')).count();
    expect({ stillOpen, errorShown, failures }).toEqual({
      stillOpen: 0,
      errorShown: 0,
      failures: [],
    });

    await page.close();
  }, 180_000);
});
