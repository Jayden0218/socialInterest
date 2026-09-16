import type { Browser, Page, Response } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';
import { anInterest } from '../support/interests';
import { eventually } from '../support/eventually';

/**
 * 008/US12 — WHERE `dismiss-post` LEAVES YOU.
 *
 * `33-mute-and-dismiss` has failed on a device three runs running, one step
 * further along each time, because each run I fixed the step that failed and
 * did not walk the rest of the route. The second half of that flow waits for a
 * feed card straight after tapping `dismiss-post` — and the safety sheet is a
 * PUSHED screen whose `onDone` is `pop` (App.tsx), so the tap lands back on
 * post detail, where no `post-<ULID>` exists at all: that id is on `PostCard`
 * and `PostTile`, and the detail screen renders neither.
 *
 * That is a navigation fact, which is the category this project has now spent
 * five emulator runs on across 005, 007 and 008 — every one of them settleable
 * in a browser in seconds (005/J-21, `share-person-.*`, the collections tabs).
 * So it is settled here, and the device spends its minutes on what only a
 * device can answer.
 *
 * Asserted through the REQUESTS the page makes, not through the view: FR-040
 * requires mute and dismissal to leave no trace on any screen, so a control
 * that set a local flag and never reached the server would look identical in
 * the DOM. The status codes are the same two lines the run aggregate reads.
 */
describe('008/US12 - the route through the safety sheet, and where it returns to', () => {
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

  it('dismiss returns to post detail, not to the feed, and both writes reach the server', async () => {
    const author = await actor('u12author');
    const reader = await actor('u12reader');
    const interest = await anInterest(reader);
    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'us12 quieter options' });
    await reader.data.interests.follow(interest.interestId);

    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const writes: string[] = [];
    page.on('response', (r: Response) => {
      const u = new URL(r.url()).pathname;
      if (/\/(dismiss|mute)$/.test(u)) writes.push(`${r.request().method()} ${u} ${r.status()}`);
    });
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, reader.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(id('tab-feed'), { timeout: 30_000 });
    await page.click(id('tab-feed'));
    await page.waitForSelector(id(`post-${postId}`), { timeout: 30_000 });
    await page.click(id(`post-${postId}`));
    await page.waitForSelector(id('post-detail-screen'), { timeout: 30_000 });

    /*
      012/T034. `open-safety` OPENS THE SHEET NOW. Reporting, muting and
      dismissing are labelled rows in it rather than one screen you reach by
      pressing a button marked Report.
    */
    await page.click(id('open-safety'));
    await page.waitForSelector(id('post-actions'), { timeout: 30_000 });
    await page.click(id('sheet-dismiss'));

    // WHERE THE TAP LEAVES YOU. `onDone` is `pop`, so this is post detail again
    // — and the flow's next step was a sixty-second wait for a feed card.
    await page.waitForSelector(id('post-detail-screen'), { timeout: 30_000 });
    expect(await page.locator(id(`post-${postId}`)).count()).toBe(0);

    /*
      AND THE SECOND HALF NEEDS NO FEED AT ALL. The sheet closes on success, so
      the person-level choice is a fresh journey to it — but the journey starts
      from the screen the dismissal returned to, not from a card six taps away.
      `nav-back` would work here as well (`17-saved` and `21-group-chat` use it
      on a pushed screen); it is simply a longer route to the same sheet, and on
      a device it would land on a feed that has just been told to stop choosing
      this post.
    */
    await page.click(id('open-safety'));
    await page.waitForSelector(id('post-actions'), { timeout: 30_000 });
    await page.click(id('sheet-mute'));
    await page.waitForSelector(id('post-detail-screen'), { timeout: 30_000 });

    /**
     * `eventually`, NOT a bare assertion — and the reason is a product decision
     * made two files away.
     *
     * `ActionSheet` closes BEFORE it runs the row's action ("so a row that
     * navigates does not leave a sheet floating over the screen it opened").
     * So `post-detail-screen` reappearing is evidence the sheet closed and
     * NOTHING about whether the request landed. Asserting straight after it is
     * a race the fast machine always wins.
     *
     * It won here every time and lost on a loaded CI runner — 2026-09-16, run
     * #347: `- "PUT /v1/people/…/mute 204"`, the dismiss recorded and the mute
     * still in flight. Same shape as the four integration tests CLAUDE.md
     * records that "waited for a duration, not a condition", and the same fix:
     * wait for the condition, fail at a deadline with what was actually seen.
     */
    await eventually(
      async () => [...writes],
      (w) =>
        w.includes(`PUT /v1/posts/${postId}/dismiss 204`) &&
        w.includes(`PUT /v1/people/${author.handle}/mute 204`),
      { timeoutMs: 15_000, describe: 'both the dismiss and the mute reaching the server' },
    );
    expect(writes).toEqual([
      `PUT /v1/posts/${postId}/dismiss 204`,
      `PUT /v1/people/${author.handle}/mute 204`,
    ]);

    await page.close();
  }, 240_000);
});
