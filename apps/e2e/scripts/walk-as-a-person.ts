import { readFileSync } from 'node:fs';
import { launchChromium } from '../support/browser';
import { startWebServer } from '../support/web-server';

/**
 * 012/T035. WALK EVERY JOURNEY AS A PERSON, and write down the first point at
 * which you cannot continue.
 *
 * Not a test — a walk. It presses what a person would press, in the order they
 * would press it, and REPORTS rather than asserts. A red assertion says "this
 * broke"; the task asks a different question, which is "where do you get
 * stuck", and those are not the same list. A suite stops at the first failure
 * and tells you about one thing; this carries on and gives you the list.
 *
 * KEPT, rather than run once and deleted. The first run of it was mostly STUCK
 * and almost none of it was the product: the store had been reset by an e2e
 * run, so the feed was legitimately empty, and four of the ids were ones I had
 * guessed rather than read — `open-comments` for `comments-button`,
 * `follow-interest-toggle` for `follow-interest-control`. Confusing a walk's
 * own mistakes for the product's is how run 36 happened, and a script that is
 * kept gets corrected once instead of re-guessed every time.
 *
 *   pnpm seed:demo "$(pnpm --silent mint:token)"   # or it walks an empty product
 *   cd apps/e2e && npx tsx scripts/walk-as-a-person.ts
 */
async function main(): Promise<void> {
  const web = await startWebServer('http://127.0.0.1:3000/v1');
  const token = readFileSync('/tmp/claude-0/devtoken', 'utf8').trim();
  const browser = await launchChromium();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript((t) => {
    (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } }).localStorage.setItem(
      'sih.auth.token',
      t as string,
    );
  }, token);

  const log: string[] = [];
  const id = (t: string) => `[data-testid="${t}"]`;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const step = async (what: string, fn: () => Promise<void>): Promise<boolean> => {
    try {
      await fn();
      log.push(`  ok    ${what}`);
      return true;
    } catch (e) {
      log.push(`  STUCK ${what}  — ${String(e).split('\n')[0]!.slice(0, 110)}`);
      return false;
    }
  };
  const see = (t: string, ms = 12_000) => page.waitForSelector(id(t), { timeout: ms });
  const tap = async (t: string) => {
    await page.waitForSelector(id(t), { timeout: 12_000 });
    await page.click(id(t));
  };

  await page.goto(web.url, { waitUntil: 'domcontentloaded' });

  log.push('J-A  read the feed, open a post, comment on it');
  await step('the feed shows posts', async () => {
    await see('home-feed-screen');
    await page.waitForSelector('[data-testid^="post-01"]', { timeout: 20_000 });
  });
  await step('a card opens post detail', async () => {
    await page.click('[data-testid^="post-01"]');
    await see('post-detail-screen');
  });
  await step('the comments screen is one tap away', async () => {
    await tap('comments-button');
    await see('comments-screen');
  });
  await step('back returns to the post', async () => {
    await tap('nav-back');
    await see('post-detail-screen');
  });
  await step('the actions sheet opens and offers report', async () => {
    await tap('open-safety');
    await see('post-actions');
    await see('sheet-report');
    await tap('post-actions-close');
  });
  await step('back returns to the feed', async () => {
    await tap('nav-back');
    await see('home-feed-screen');
  });

  log.push('J-B  explore, open an interest, follow it');
  await step('Explore shows tiles before typing', async () => {
    await tap('tab-discover');
    await see('interest-tiles');
  });
  await step('a tile opens the interest space', async () => {
    await tap('search-result-0');
    await see('interest-screen');
  });
  await step('the space names its counts', async () => {
    await see('interest-counts');
  });
  await step('the follow control is there', async () => {
    await see('follow-interest-control');
  });
  await step('back returns to Explore', async () => {
    await tap('nav-back');
    await see('interest-search-screen');
  });

  log.push('J-C  find a person, open their profile, reach the safety actions');
  await step('typing searches people too', async () => {
    await page.fill(id('interest-search-input'), 'maya');
    await see('people-results', 20_000);
  });
  await step('a person result opens their profile', async () => {
    await page.click('[data-testid^="person-result-"]');
    await see('profile-screen');
  });
  await step('a profile offers mute and block', async () => {
    await tap('open-person-actions');
    await see('person-actions');
    await see('sheet-block');
    await tap('person-actions-close');
  });

  log.push('J-D  the other tabs open at all');
  for (const [tab, screen] of [
    ['tab-chats', 'inbox-screen'],
    ['tab-notifications', 'notifications-screen'],
    ['tab-profile', 'profile-screen'],
  ] as const) {
    // Back out to the tab bar first: a pushed screen has no tabs (005/J-21).
    await step(`${tab} opens ${screen}`, async () => {
      for (let i = 0; i < 4; i++) {
        if (await page.$(id('tab-feed'))) break;
        await tap('nav-back');
      }
      await tap(tab);
      await see(screen);
    });
  }

  log.push('J-E  compose is reachable and asks for what it needs');
  await step('the + opens the media picker', async () => {
    for (let i = 0; i < 4; i++) {
      if (await page.$(id('tab-feed'))) break;
      await tap('nav-back');
    }
    await tap('open-compose');
    await see('media-picker-screen');
  });

  process.stderr.write(`\n${log.join('\n')}\n`);
  process.stderr.write(`\npage errors: ${errors.length === 0 ? 'none' : errors.join(' | ')}\n`);
  await browser.close();
  await web.stop();
}
void main().catch((e: unknown) => {
  process.stderr.write(`walk failed to start: ${String(e)}\n`);
  process.exit(1);
});
