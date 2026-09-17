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
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer } from '../support/web-server';
import { giveCredentials } from '../support/people';
import { startApi, stopApi } from '../support/api-process';
import { resetStore } from '../support/reset';
import { ensureJwtSecret } from '../support/secret';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';
import { anInterest } from '../support/interests';

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
  /**
   * 390x844 — THE ARTBOARDS' OWN FRAME, not merely "phone-shaped".
   *
   * This was 414x896, which is a real phone and the wrong number: every artboard
   * in `design/007-ui` is drawn at 390x844 and `canvas.json` gives each frame
   * exactly that size. Capturing at a different width means every comparison
   * against the design is off by 24 points before anybody looks, and a fold
   * measured here sits 52 points lower than the one the design was drawn for —
   * which is the class of error that cost four device runs when a guard was
   * written against an invented constant rather than a measured one.
   */
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => console.log('page error:', e.message));

  let n = 0;
  /**
   * WHAT THE BROWSER ACTUALLY COMPUTED, not what the source asked for.
   *
   * The audit's whole reason for reading the rendered DOM rather than the app's
   * styles is the typeface defect: `tokens.ts` named Plus Jakarta Sans for nine
   * features while every screen rendered in Roboto, because the token was
   * applied to nothing. A source-to-source comparison calls that a match.
   * `getComputedStyle` cannot be fooled that way — it reports the family the
   * text is actually set in.
   *
   * Collected as SETS rather than per-element values, because Pass 1 is a
   * vocabulary diff: it asks whether this screen's colours, sizes, weights and
   * radii are the ones the artboard names, which needs no element-by-element
   * correspondence and so needs no mapping file to be right first.
   */
  /**
   * WHAT THE BROWSER ACTUALLY COMPUTED, not what the source asked for.
   *
   * The audit reads the rendered DOM rather than the app's styles because of the
   * typeface defect: `tokens.ts` named Plus Jakarta Sans for nine features while
   * every screen rendered in Roboto, since the token was applied to nothing. A
   * source-to-source comparison calls that a match; `getComputedStyle` reports
   * the family the text is actually set in and cannot be fooled that way.
   *
   * Sets, not per-element values: Pass 1 is a VOCABULARY diff — does this screen
   * use the colours, sizes, weights and radii the artboard names — which needs
   * no element-by-element correspondence, and so needs no mapping file to be
   * right on its first run.
   *
   * PASSED AS A STRING, AND THAT IS NOT A STYLE CHOICE. `page.evaluate` ships
   * the function's SOURCE to the browser, and this script runs under tsx, whose
   * esbuild transform wraps inner functions in a `__name()` helper that exists
   * only in the Node bundle. A normal callback therefore compiles fine, uploads
   * fine, and dies in the page with `ReferenceError: __name is not defined` —
   * which is what the first run of this did. A string is never transformed.
   */
  const MEASURE_JS = `(() => {
    const colors = new Set(), fontSizes = new Set(), fontWeights = new Set();
    const fontFamilies = new Set(), radii = new Set(), gaps = new Set();
    const untyped = [];
    const seen = (set, v) => {
      if (v && v !== 'none' && v !== 'normal' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)') set.add(v);
    };
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      // Only what is ON the screen. An off-screen node's styles are not part of
      // what this artboard shows, and counting them reports drift nobody sees.
      if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > 844) continue;
      const c = getComputedStyle(el);
      seen(colors, c.color); seen(colors, c.backgroundColor); seen(colors, c.borderTopColor);
      if (el.textContent && el.textContent.trim().length > 0 && el.children.length === 0) {
        seen(fontSizes, c.fontSize); seen(fontWeights, c.fontWeight); seen(fontFamilies, c.fontFamily);
        // NAME THE OFFENDERS, do not merely count them. A number says drift
        // exists; the text and the nearest testID say WHERE, which is the
        // difference between a finding and a fix.
        if (c.fontFamily.indexOf('PlusJakartaSans') === -1 && untyped.length < 12) {
          var node = el, tid = '';
          for (var up = 0; up < 6 && node; up += 1) {
            var got = node.getAttribute && node.getAttribute('data-testid');
            if (got) { tid = got; break; }
            node = node.parentElement;
          }
          untyped.push(el.textContent.trim().slice(0, 42) + (tid ? '  [' + tid + ']' : '  [no testid]'));
        }
      }
      seen(radii, c.borderTopLeftRadius); seen(gaps, c.gap);
    }
    const out = (s) => Array.from(s).sort();
    return { colors: out(colors), fontSizes: out(fontSizes), fontWeights: out(fontWeights),
             fontFamilies: out(fontFamilies), radii: out(radii), gaps: out(gaps),
             untypedText: untyped };
  })()`;

  const measure = async (): Promise<Record<string, string[]>> =>
    page.evaluate(MEASURE_JS) as Promise<Record<string, string[]>>;

  const measured: Record<string, Record<string, string[]>> = {};
  const shot = async (name: string): Promise<void> => {
    n += 1;
    const file = resolve(OUT, `${String(n).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    measured[name] = await measure();
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

  /**
   * 013/FR-017. THE CATALOGUE IS NOT SEEDED, so this makes one the way a person
   * does. It read `listTop({ limit: 5 }).items[0]!` and would have been
   * `undefined` on a reset store — the same second-order dependency that broke
   * forty-six e2e tests. `support/interests.ts` is the one place that knows how.
   */
  const interest = await anInterest(me);
  await me.data.interests.follow(interest.interestId);
  /**
   * A REAL-LOOKING PHOTOGRAPH, not the suite's 1x1 pixel.
   *
   * `jpegPlain()` is a single black pixel - perfect for asserting that a byte
   * reached object storage, useless for showing anyone what the product looks
   * like. These captures exist to be looked at, so they publish an actual image.
   *
   * Generated by `ffmpeg`, resolved the way the product resolves it —
   * `FFMPEG_PATH`, else `PATH`, which is the pattern `mp4Short()` now uses too.
   * Where the host has none and `apt-get install ffmpeg` is blocked, that is
   * what `scripts/ffmpeg-shim/` is for.
   */
  const photo = (source: string): Buffer =>
    execFileSync(
      process.env['FFMPEG_PATH'] ?? 'ffmpeg',
      [
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
  // 011: the screen takes an email address and a password now (FR-027).
  const capture = await giveCredentials(me.userId, me.handle);
  await page.fill(id('sign-in-email'), capture.email);
  await page.fill(id('sign-in-password'), capture.password);
  await click('sign-in-submit');
  await page.waitForSelector(id('sign-in-screen'), { state: 'detached', timeout: 20_000 });

  /**
   * 007/FR-014. SIGNING IN LANDS ON THE COLD START, a pushed screen with no tab
   * bar — so this captures it and then dismisses it. Without the dismissal the
   * next line waits thirty seconds for a tab bar the app deliberately does not
   * render yet, which is exactly how fifteen browser journeys broke in one
   * commit.
   *
   * Raced rather than polled: the container renders a loading placeholder
   * first, so querying for the skip button immediately finds nothing and sails
   * past.
   */
  await Promise.race([
    page.waitForSelector(id('pick-skip'), { timeout: 20_000 }).catch(() => null),
    page.waitForSelector(id('tab-feed'), { timeout: 20_000 }).catch(() => null),
  ]);
  if (await page.$(id('pick-skip'))) {
    await page.waitForTimeout(400);
    await shot('cold-start');
    await click('pick-skip');
    await page.waitForSelector(id('pick-interests-screen'), { state: 'detached', timeout: 20_000 });
  }

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

  /**
   * The measurements go beside the pictures, because a PNG is evidence a person
   * can read and this is evidence a diff can read. One walk produces both, so
   * they can never describe different runs.
   */
  const report = resolve(OUT, 'measured.json');
  writeFileSync(report, `${JSON.stringify(measured, null, 2)}\n`);
  console.log(`\n${n} screens captured into ${OUT}`);
  console.log(`measurements for ${Object.keys(measured).length} screens -> ${report}`);
  await browser.close();
  await web.stop();
  await stopApi();
}

main().catch(async (e: unknown) => {
  console.error(String(e));
  await stopApi().catch(() => undefined);
  process.exit(1);
});
