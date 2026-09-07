/**
 * Screenshots every screen the app can reach, into docs/screens/.
 *
 * WHAT THESE ARE, stated plainly because it decides what they are worth: the
 * app's own React components rendered by react-native-web in Chromium, driven
 * through the app's own navigation against a REAL API with real data. They are
 * the product's screens and the product's copy.
 *
 * WHAT THEY ARE NOT: native Android frames. react-native-web renders through DOM
 * primitives, so native layout, fonts, safe areas, touch handling and the back
 * button are not what you see here (Principle V - emulation is not evidence).
 * The Android emulator does render real frames, but its artifacts upload to a
 * host this sandbox's egress denies, so I cannot fetch them to show you.
 *
 * Not a test and deliberately not named `.spec.ts`: it asserts nothing, and a
 * file that only captures images should never be able to fail CI.
 *
 * Usage: npx tsx apps/e2e/scripts/capture-screens.ts
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer } from '../support/web-server';
import { startApi, stopApi } from '../support/api-process';
import { resetStore } from '../support/reset';
import { ensureJwtSecret } from '../support/secret';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

const OUT = resolve(__dirname, '../../../docs/screens');
const id = (t: string) => `[data-testid="${t}"]`;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  ensureJwtSecret();
  resetStore();

  const apiUrl = await startApi(3117);
  process.env['E2E_BASE_URL'] = apiUrl;
  const web = await startWebServer(`${apiUrl}/v1`);
  const browser = await launchChromium();
  // A phone-shaped viewport, so the captures read as the product rather than as
  // a desktop page that happens to contain it.
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  page.on('pageerror', (e) => console.log('page error:', e.message));

  let n = 0;
  const shot = async (name: string): Promise<void> => {
    n += 1;
    const file = resolve(OUT, `${String(n).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`captured ${file}`);
  };
  const click = async (testID: string): Promise<void> => {
    await page.click(id(testID));
    await page.waitForTimeout(400);
  };
  const settle = async (testID: string): Promise<void> => {
    await page.waitForSelector(id(testID), { timeout: 20_000 });
    await page.waitForTimeout(400);
  };

  // ---- data, so no screen is captured empty and pretending to be the product
  const me = await actor('shotowner');
  const friend = await actor('shotfriend');
  const groupA = await actor('shotgroupa');
  const groupB = await actor('shotgroupb');
  await friend.data.people.follow(me.handle);
  await groupA.data.people.follow(me.handle);
  await groupB.data.people.follow(me.handle);

  const interests = await me.data.interests.listTop({ limit: 5 });
  const interest = interests.items[0]!;
  await me.data.interests.follow(interest.interestId);
  const postId = await publishReadyImage(me, [interest.interestId], {
    caption: 'Morning session at the bouldering gym.',
  });
  await publishReadyImage(friend, [interest.interestId], {
    caption: 'Second climb of the week.',
  });
  await friend.data.engagement.comment(postId, 'Looks like a great hold.');

  const place = await me.data.places.create({
    name: 'Tiong Bahru Bakery',
    category: 'cafe',
    locality: `Singapore-${Date.now().toString(36)}`,
  });
  await me.data.places.rate(place.placeId, { score: 5, body: 'The kaya toast is worth the queue.' });
  await friend.data.places.rate(place.placeId, { score: 4, body: 'Busy but good.' });

  const pair = await friend.data.conversations.open(me.handle);
  await friend.data.conversations.send(pair.conversationId, { body: 'Are you climbing tomorrow?' });

  // ---- signed out
  await page.goto(web.url, { waitUntil: 'domcontentloaded' });
  await settle('app-root');
  await shot('feed-signed-out');
  await click('open-sign-in');
  await settle('sign-in-screen');
  await shot('sign-in');

  // ---- signed in
  await page.fill(id('sign-in-token'), me.token);
  await click('sign-in-submit');
  await page.waitForSelector(id('sign-in-screen'), { state: 'detached', timeout: 20_000 });
  await page.waitForTimeout(800);
  await shot('home-feed');

  await click('tab-discover');
  await settle('interest-search-screen');
  await shot('discover-search');

  await page.fill(id('search-input'), interest.name.slice(0, 4));
  await page.waitForTimeout(900);
  await shot('discover-results');
  await click('search-result-0');
  await settle('interest-screen');
  await shot('interest-space');

  await click('tab-feed');
  await page.waitForTimeout(600);
  await click(`post-${postId}`);
  await settle('post-detail-screen');
  await shot('post-detail');
  await click('comments-button');
  await settle('comments-screen');
  await shot('comments');
  await click('nav-back');
  await page.waitForTimeout(400);

  // ---- places and reviews (005/US1, US2)
  await page.goto(web.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await click('tab-discover');
  await page.fill(id('search-input'), 'Tiong');
  await page.waitForTimeout(1000);
  await shot('discover-place-result');
  const placeResult = page.locator('[data-testid^="place-result-"]').first();
  if (await placeResult.count()) {
    await placeResult.click();
    await settle('place-screen');
    await shot('place-with-rating-and-reviews');
  }

  // ---- chat (004/US1) and groups (005/US3)
  await click('tab-chats');
  await settle('inbox-screen');
  await shot('chats-inbox');
  const openPair = page.locator('[data-testid^="open-conversation-"]').first();
  if (await openPair.count()) {
    await openPair.click();
    await settle('conversation-screen');
    await shot('conversation');
    await click('nav-back');
    await page.waitForTimeout(400);
  }

  await click('new-group');
  await settle('new-group-screen');
  await shot('new-group-empty');
  await page.fill(id('group-search-input'), 'shotgroup');
  await page.waitForSelector(id(`group-participant-${groupA.handle}`), { timeout: 20_000 });
  await click(`group-participant-${groupA.handle}`);
  await click(`group-participant-${groupB.handle}`);
  await page.fill(id('group-name-input'), 'Climbing Tuesday');
  await page.waitForTimeout(300);
  await shot('new-group-filled');
  await click('create-group');
  await settle('conversation-screen');
  await page.fill(id('message-input'), 'Same time this week?');
  await click('send-message');
  await page.waitForTimeout(700);
  await shot('group-conversation');
  await click('nav-back');
  await settle('inbox-screen');
  await shot('chats-inbox-with-group');

  // ---- activity and profile
  await click('tab-notifications');
  await page.waitForTimeout(700);
  await shot('activity');

  await click('tab-profile');
  await page.waitForTimeout(900);
  await shot('profile');
  const saved = page.locator(id('open-saved'));
  if (await saved.count()) {
    await saved.click();
    await settle('saved-screen');
    await shot('saved');
    await click('nav-back');
    await page.waitForTimeout(400);
  }
  const edit = page.locator(id('open-edit-profile'));
  if (await edit.count()) {
    await edit.click();
    await settle('edit-profile-screen');
    await shot('edit-profile');
    await click('nav-back');
    await page.waitForTimeout(400);
  }

  // ---- compose (001/US1)
  const compose = page.locator(id('open-compose'));
  if (await compose.count()) {
    await compose.click();
    await page.waitForTimeout(900);
    await shot('compose');
  }

  console.log(`\n${n} screens captured into ${OUT}`);
  await browser.close();
  await web.stop();
  await stopApi();
}

main().catch(async (e: unknown) => {
  console.error(String(e));
  await stopApi().catch(() => undefined);
  process.exit(1);
});
