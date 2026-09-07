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
import { execFileSync } from 'node:child_process';
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

  /**
   * BUILD THE BUNDLE, or capture yesterday's pixels.
   *
   * `startWebServer` serves `apps/mobile/web`, which is a build ARTEFACT. The
   * first version of this script did not build it, so after changing the entire
   * theme it produced twenty screenshots of the previous design - a result that
   * looked exactly like evidence and showed nothing. jest's globalSetup builds
   * it for the browser journeys; a standalone script has to do it itself.
   *
   * Relative API base for the same reason globalSetup uses one: an absolute URL
   * baked in by an earlier manual build points the page at the wrong API.
   */
  execFileSync('pnpm', ['--filter', '@sih/mobile', 'build:web'], {
    cwd: resolve(__dirname, '../../..'),
    env: { ...process.env, EXPO_PUBLIC_API_BASE_URL: '/v1' },
    stdio: 'pipe',
  });

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

  /**
   * Back to the tab root, however deep we are.
   *
   * The tab bar exists only at the root of the stack, so `tab-feed` is simply
   * not on a pushed screen - the same fact that cost two Android runs on
   * 21-group-chat. Popping until `nav-back` is gone means this script never has
   * to know how deep it went.
   */
  const backToTabs = async (): Promise<void> => {
    for (let i = 0; i < 6; i++) {
      if ((await page.locator(id('nav-back')).count()) === 0) return;
      await page.click(id('nav-back'));
      await page.waitForTimeout(400);
    }
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
  /**
   * A REAL-LOOKING PHOTOGRAPH, not the suite's 1x1 pixel.
   *
   * `jpegPlain()` is a single black pixel - perfect for asserting that a byte
   * reached object storage, useless for showing anyone what the product looks
   * like. These captures exist to be looked at, so they publish an actual image.
   *
   * Generated by the ffmpeg container, which is the pattern `mp4Short()` already
   * uses: the host has no ffmpeg, and `apt-get install ffmpeg` is blocked here.
   */
  const photo = (source: string): Buffer =>
    execFileSync(
      'docker',
      [
        'run', '--rm', '-i', '--entrypoint', 'ffmpeg',
        process.env['FFMPEG_IMAGE'] ?? 'linuxserver/ffmpeg:latest',
        /**
         * NO `-ss` SEEK, and that is not a style choice.
         *
         * The first version seeked to `00:00:0N` in a one-second source, ffmpeg
         * wrote nothing, and the capture died with "Conversion failed!". That is
         * character-for-character the defect CLAUDE.md already records for the
         * video poster frame - `-ss 00:00:01` past the end of a short clip - and
         * I reproduced it in a new place within the same repository.
         *
         * The two posts differ by SOURCE PATTERN instead, which needs no seek.
         */
        '-f', 'lavfi', '-i', `${source}=size=1200x900:duration=1:rate=1`,
        '-frames:v', '1', '-f', 'mjpeg', '-',
      ],
      { maxBuffer: 32 * 1024 * 1024 },
    );

  const postId = await publishReadyImage(me, [interest.interestId], {
    caption: 'Morning session at the bouldering gym.',
    bytes: photo('testsrc2'),
  });
  await publishReadyImage(friend, [interest.interestId], {
    caption: 'Second climb of the week.',
    bytes: photo('smptebars'),
  });
  await friend.data.engagement.comment(postId, 'Looks like a great hold.');

  const locality = `Singapore-${Date.now().toString(36)}`;
  const place = await me.data.places.create({
    name: 'Tiong Bahru Bakery',
    category: 'cafe',
    locality,
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

  await page.fill(id('interest-search-input'), interest.name.slice(0, 4));
  await page.waitForTimeout(900);
  await shot('discover-results');
  const firstInterest = page.locator('[data-testid^="search-result-"]').first();
  if (await firstInterest.count()) await firstInterest.click();
  await settle('interest-screen');
  await shot('interest-space');

  await backToTabs();
  await click('tab-feed');
  await page.waitForTimeout(600);
  await click(`post-${postId}`);
  await settle('post-detail-screen');
  await shot('post-detail');
  await click('comments-button');
  await settle('comments-screen');
  await shot('comments');
  await backToTabs();

  // ---- places and reviews (005/US1, US2)
  await page.goto(web.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await click('tab-discover');
  await page.fill(id('interest-search-input'), 'Tiong');
  // 004/FR-014: place search is scoped by locality, so the second field is not
  // optional decoration - without it the screen correctly finds no places.
  await page.fill(id('place-search-locality'), locality);
  await page.waitForTimeout(1200);
  await shot('discover-place-result');
  const placeResult = page.locator('[data-testid^="place-result-"]').first();
  if (await placeResult.count()) {
    await placeResult.click();
    await settle('place-screen');
    await shot('place-with-rating-and-reviews');
  }
  await backToTabs();

  // ---- chat (004/US1) and groups (005/US3)
  await click('tab-chats');
  await settle('inbox-screen');
  await shot('chats-inbox');
  const openPair = page.locator('[data-testid^="open-conversation-"]').first();
  if (await openPair.count()) {
    await openPair.click();
    await settle('conversation-screen');
    await shot('conversation');
    await backToTabs();
    await click('tab-chats');
    await settle('inbox-screen');
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
  await backToTabs();
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
    await backToTabs();
    await click('tab-profile');
    await page.waitForTimeout(600);
  }
  const edit = page.locator(id('open-edit-profile'));
  if (await edit.count()) {
    await edit.click();
    await settle('edit-profile-screen');
    await shot('edit-profile');
    await backToTabs();
    await click('tab-profile');
    await page.waitForTimeout(600);
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
