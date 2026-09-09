import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

/**
 * 006/J-09: THE BLOCK CONTROL IS REACHABLE ON A SHORT SCREEN.
 *
 * Emulator run 35 failed `09-report-and-block` on `block-person is visible`.
 * The cause was not the flow: `Screen` was a plain `View`, so the safety sheet
 * could not be scrolled and the button - at 665px on a 640px-tall display - was
 * unreachable. A safety affordance nobody can reach is Constitution IV failing
 * quietly, and it took a 30-minute device run to see it.
 *
 * This settles the same thing in seconds, which is the point. Every browser
 * screenshot in `docs/screens` is 414x896, where the button sits comfortably
 * inside the viewport; the defect only exists below ~665px of height, and
 * nothing here had ever looked at a short screen.
 *
 * It does NOT replace the device flow. react-native-web renders the same
 * components through DOM primitives, so it says nothing about native scroll
 * physics or touch. It makes the next device run spend its 30 minutes on what
 * only a device can answer.
 */
describe('006/J-09 - the safety sheet on a short screen', () => {
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

  async function openSafetySheet(width: number, height: number): Promise<void> {
    page = await browser.newPage({ viewport: { width, height } });
    const author = await actor(`sfa${width}x${height}`);
    const reader = await actor(`sfr${width}x${height}`);
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'safety fit' });
    await reader.data.interests.follow(interest.interestId);
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, reader.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="tab-feed"]', { timeout: 30_000 });
    await page.click('[data-testid="tab-feed"]');
    await page.waitForSelector(`[data-testid="post-${postId}"]`, { timeout: 30_000 });
    await page.click(`[data-testid="post-${postId}"]`);
    await page.click('[data-testid="open-safety"]');
    await page.waitForSelector('[data-testid="report-reasons"]', { timeout: 30_000 });
  }

  /**
   * Brings a control into view the way the APP would, never the way the browser
   * would.
   *
   * `scrollIntoViewIfNeeded` scrolls the DOCUMENT, and a browser page scrolls
   * where a React Native screen does not — that was the first version of the
   * block-control test below and it passed with the defect still in place. So
   * this walks for a container the app itself scrolls, and moves that.
   *
   * Returns false when no such container exists, which is the run-35 case: the
   * control was not below the fold, it was UNREACHABLE.
   */
  async function scrollControlIntoView(p: Page, control: string): Promise<boolean> {
    return p.locator(control).first().evaluate((el: unknown) => {
      type Node = {
        parentElement: Node | null;
        scrollHeight: number;
        clientHeight: number;
        scrollTop: number;
        getBoundingClientRect(): { top: number; bottom: number };
      };
      const g = globalThis as unknown as { getComputedStyle(n: unknown): { overflowY: string } };
      const target = el as Node;
      for (let n = target.parentElement; n; n = n.parentElement) {
        const overflowY = g.getComputedStyle(n).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
          const delta = target.getBoundingClientRect().top - n.getBoundingClientRect().top;
          n.scrollTop = Math.max(0, delta - 16);
          return true;
        }
      }
      return false;
    });
  }

  /**
   * 320x640 is SHORTER than the sheet is tall. That is the whole test: the
   * control must still be reachable, and before this fix it was not.
   */
  it('the block control is below the fold on a short screen, and can be scrolled to', async () => {
    await openSafetySheet(320, 640);
    const target = page.locator('[data-testid="block-person"]');

    // First: confirm this screen really is the failing case, so a future layout
    // change that makes the sheet short cannot leave this passing vacuously.
    const laidOutAt = (await target.boundingBox())!;
    expect(laidOutAt.y + laidOutAt.height).toBeGreaterThan(640);

    // Then: an ANCESTOR OF THE ELEMENT SCROLLS.
    //
    // Not `scrollIntoViewIfNeeded`, which was the first version of this and
    // passed with the defect still in place: Playwright happily scrolls the
    // DOCUMENT, and a browser page scrolls when a React Native screen does not.
    // The browser was answering a question the device never asks. Verified by
    // reverting the fix and watching it stay green.
    //
    // What maps to a device is whether the APP's own container can scroll, so
    // that is what this walks the tree for.
    //
    // Typed loosely on purpose: this package is typed for Node and has no DOM
    // lib, and the function below is serialised and runs in the page.
    const scrollable = await target.evaluate((el: unknown) => {
      type Node = { parentElement: Node | null; scrollHeight: number; clientHeight: number };
      const g = globalThis as unknown as {
        getComputedStyle(n: unknown): { overflowY: string };
      };
      for (let n = el as Node | null; n; n = n.parentElement) {
        const overflowY = g.getComputedStyle(n).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
          return true;
        }
      }
      return false;
    });
    expect(scrollable).toBe(true);
    await page.close();
  }, 180_000);

  it('and is visible without scrolling on a tall screen', async () => {
    await openSafetySheet(414, 896);
    const box = (await page.locator('[data-testid="block-person"]').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(896);
    await page.close();
  }, 180_000);

  /**
   * 007/SC-010, T058 — NOTHING IS UNREACHABLE AT THE LARGEST FONT.
   *
   * The safety sheet's block control was off screen by 38 points in run 35, and
   * the pre-006 measurement had it INSIDE by thirteen. A larger platform font, a
   * longer sentence or a shorter phone would each have done it alone: the screen
   * was always one edit from hiding a safety control.
   *
   * So this measures the general case rather than that one screen — every
   * primary control on a 640pt viewport with the text scaled up — because "the
   * type got bigger and something fell off the bottom" is not a defect you find
   * by looking at a screenshot at the size you designed at.
   *
   * `zoom` is the browser's stand-in for the platform font setting. It is NOT
   * the same thing — react-native-web ignores the platform setting entirely,
   * which is exactly why `Avatar`'s overflowing initial could never have been
   * caught here — so this measures LAYOUT under larger text and claims nothing
   * about native font scaling. The device run is what answers that.
   */
  interface FitContext {
    postId?: string;
  }

  const SCREENS: {
    name: string;
    /** Content the screen needs before it can be opened. Most need none. */
    prepare?: (reader: Awaited<ReturnType<typeof actor>>) => Promise<FitContext>;
    open: (page: Page, ctx: FitContext) => Promise<void>;
    control: string;
    /**
     * The screen SCROLLS ON A MEASUREMENT (007/T051), so its controls have to be
     * reachable rather than above the fold. Set only where that measurement
     * exists — 006's run 36 cost a 27-minute run and took the suite from 18/19
     * to 1/19 by applying one screen's finding to seven unmeasured ones.
     */
    allowScroll?: boolean;
  }[] = [
    {
      name: 'feed',
      open: async (page) => {
        await page.click('[data-testid="tab-feed"]');
        await page.waitForSelector('[data-testid="home-feed-screen"]', { timeout: 30_000 });
      },
      control: '[data-testid="open-compose"]',
    },
    {
      name: 'explore',
      open: async (page) => {
        await page.click('[data-testid="tab-discover"]');
        await page.waitForSelector('[data-testid="interest-search-screen"]', { timeout: 30_000 });
      },
      control: '[data-testid="interest-search-input"]',
    },
    {
      name: 'profile',
      open: async (page) => {
        await page.click('[data-testid="tab-profile"]');
        await page.waitForSelector('[data-testid="open-edit-profile"]', { timeout: 30_000 });
      },
      control: '[data-testid="open-edit-profile"]',
    },
    /**
     * 008/US3, SC-017. The Following tab.
     *
     * A new control on the app's primary surface, and the one 008/Phase A adds
     * to a screen that has to hold at 130% text. It sits in a two-item row under
     * the title, so the risk is horizontal rather than vertical - which is why
     * the assertion below checks both edges, and why measuring only the fold
     * would have missed it.
     */
    {
      name: 'feed following tab',
      open: async (page) => {
        await page.click('[data-testid="tab-feed"]');
        await page.waitForSelector('[data-testid="feed-tab-following"]', { timeout: 30_000 });
      },
      control: '[data-testid="feed-tab-following"]',
    },
    /**
     * 008/US2. The notifications surface, which now writes on view.
     *
     * Included because the surface gained behaviour rather than because it
     * gained a control: a screen that fails to render is a screen that never
     * marks anything read, and this is the cheapest place to notice.
     */
    {
      name: 'notifications',
      open: async (page) => {
        await page.click('[data-testid="tab-notifications"]');
        await page.waitForSelector('[data-testid="notifications-screen"]', { timeout: 30_000 });
      },
      control: '[data-testid="notifications-screen"]',
    },
    /**
     * 008/US5, SC-017. THE AVATAR EDITOR.
     *
     * `avatarKey` had no writer at all before Phase B, so this control is the
     * feature: if it falls off a 640pt screen at 130% text there is no other way
     * to set a picture. It sits inside a scrolling screen, which is why the
     * assertion below still means something — `EditProfileScreen` is one of the
     * few that genuinely scrolls, and a control that scrolls into view is not
     * the same claim as one that fits.
     */
    {
      name: 'edit profile avatar',
      open: async (page) => {
        await page.click('[data-testid="tab-profile"]');
        await page.waitForSelector('[data-testid="open-edit-profile"]', { timeout: 30_000 });
        await page.click('[data-testid="open-edit-profile"]');
        await page.waitForSelector('[data-testid="edit-profile-screen"]', { timeout: 30_000 });
      },
      control: '[data-testid="change-avatar"]',
    },
    /**
     * 008/US6. The Posts tab in Discover.
     *
     * A second control in a two-item row, so the risk is horizontal — the same
     * shape as the Following tab above, on a screen that also carries a text
     * field. Both edges are checked, which is what the fold alone would miss.
     */
    {
      name: 'discover posts tab',
      open: async (page) => {
        await page.click('[data-testid="tab-discover"]');
        await page.waitForSelector('[data-testid="interest-search-screen"]', { timeout: 30_000 });
      },
      control: '[data-testid="search-tab-posts"]',
    },
    /**
     * 008/US4. Sending a post to a person.
     *
     * Reached through the viewer's OWN post rather than the feed's: the ranked
     * feed decides what a fresh account sees, and a fit measurement that depends
     * on the ranker is a measurement that fails for a reason unrelated to fit.
     * The profile grid is deterministic.
     */
    {
      name: 'post detail share',
      prepare: async (reader) => {
        const interest = (await reader.data.interests.listTop({ limit: 1 })).items[0]!;
        return { postId: await publishReadyImage(reader, [interest.interestId], { caption: 'fit share' }) };
      },
      open: async (page, ctx) => {
        await page.click('[data-testid="tab-profile"]');
        await page.waitForSelector(`[data-testid="post-${ctx.postId}"]`, { timeout: 30_000 });
        await page.click(`[data-testid="post-${ctx.postId}"]`);
        await page.waitForSelector('[data-testid="post-detail-screen"]', { timeout: 30_000 });
        await page.click('[data-testid="share-button"]');
        await page.waitForSelector('[data-testid="share-action"]', { timeout: 30_000 });
      },
      // The RECIPIENT PICKER inside the opened sheet, not the button that opens
      // it. Run 35's defect was a control at 665px on a 640px screen INSIDE a
      // sheet whose entry point was perfectly reachable, so measuring the entry
      // point is measuring the half that was never in doubt.
      control: '[data-testid="share-to-person"]',
    },
    /**
     * 008/US7, Phase C. The REPLY control, on a thread that already has a
     * comment.
     *
     * It sits under a `flex: 1` list, which is the arrangement 006 found
     * absorbs a keyboard resize — the comment composer passed runs 34 and 37
     * where sign-in did not. What is measured here is the other half: that at
     * 130% text the control is still on the screen at all.
     */
    {
      name: 'comment reply',
      prepare: async (reader) => {
        const interest = (await reader.data.interests.listTop({ limit: 1 })).items[0]!;
        const postId = await publishReadyImage(reader, [interest.interestId], { caption: 'fit thread' });
        await reader.data.engagement.comment(postId, 'a remark to reply to');
        return { postId };
      },
      open: async (page, ctx) => {
        await page.click('[data-testid="tab-profile"]');
        await page.waitForSelector(`[data-testid="post-${ctx.postId}"]`, { timeout: 30_000 });
        await page.click(`[data-testid="post-${ctx.postId}"]`);
        await page.click('[data-testid="comments-button"]');
        await page.waitForSelector('[data-testid="comment-0"]', { timeout: 30_000 });
      },
      control: '[data-testid="comment-reply-0"]',
    },
    /**
     * 008/US11, Phase C. SAVE, in the compose header.
     *
     * Beside Share rather than below the fold: the whole point of the control
     * is that somebody can leave, and one they have to scroll to find is one
     * they leave without.
     */
    {
      name: 'compose save draft',
      open: async (page) => {
        await page.click('[data-testid="open-compose"]');
        await page.waitForSelector('[data-testid="media-picker-screen"]', { timeout: 30_000 });
        await page.click('[data-testid="media-item-image-0"]');
        await page.click('[data-testid="media-continue"]');
        await page.waitForSelector('[data-testid="compose-screen"]', { timeout: 30_000 });
      },
      control: '[data-testid="save-draft"]',
    },
    /**
     * 008/US13, Phase D. THE PRIVACY SWITCH, in Edit profile.
     *
     * Edit profile is the screen 007/T051 measured and turned `scroll` on for,
     * with a number behind it — so this case asks the question that measurement
     * left open for a control added afterwards: privacy sits between the
     * notification switches and the account-deletion block, and a screen that
     * scrolls can still put a control off the RIGHT edge, which is as
     * unreachable and is the half nobody looks for.
     */
    {
      name: 'account privacy switch',
      open: async (page) => {
        await page.click('[data-testid="tab-profile"]');
        await page.click('[data-testid="open-edit-profile"]');
        await page.waitForSelector('[data-testid="account-privacy"]', { timeout: 30_000 });
      },
      control: '[data-testid="account-privacy-switch"]',
      // Scrolled to, not required above the fold: this screen scrolls on a
      // measurement (007/T051) and its primary action is Save, in the header.
      allowScroll: true,
    },
    /**
     * 008/US14, Phase D. THE WAY TO "WHAT WAS REMOVED OF MINE".
     *
     * Constitution IV: a route to a human is only real if somebody can find it.
     * It is above the delete-account block deliberately — a person who cannot
     * contest a removal and meets "Delete account" first has been offered the
     * wrong door — and this is where that ordering is measured rather than
     * asserted in a comment.
     */
    {
      name: 'moderation notices entry',
      open: async (page) => {
        await page.click('[data-testid="tab-profile"]');
        await page.click('[data-testid="open-edit-profile"]');
        await page.waitForSelector('[data-testid="open-moderation-notices"]', { timeout: 30_000 });
      },
      control: '[data-testid="open-moderation-notices"]',
      allowScroll: true,
    },
  ];

  it.each(SCREENS)('$name keeps its primary control reachable at 130% text on a 640pt screen', async ({ prepare, open, control, allowScroll }) => {
    const reader = await actor(`fit${Math.random().toString(36).slice(2, 8)}`);
    const ctx: FitContext = prepare ? await prepare(reader) : {};
    page = await browser.newPage({ viewport: { width: 360, height: 640 } });
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, reader.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="tab-feed"]', { timeout: 30_000 });

    // Text only, not the whole layout: scaling the viewport would test a
    // smaller phone, which is a different question and one the width above
    // already asks.
    await page.addStyleTag({ content: 'body { font-size: 130% }' });
    await open(page, ctx);

    /**
     * A control on a screen that SCROLLS ON A MEASUREMENT is reachable if the
     * app's own scroll container can bring it into view — which is a different
     * claim from "above the fold", and one run 35 proved matters: its defect was
     * a `Screen` that was a plain View, so the control was not below the fold,
     * it was UNREACHABLE. `scrollControlIntoView` walks for a container the APP
     * scrolls, never the document (see the note on that helper).
     */
    if (allowScroll) {
      // FALSE means no container the app scrolls — the run-35 defect exactly,
      // and a much worse failure than a control below a fold.
      expect(await scrollControlIntoView(page, control)).toBe(true);
    }

    const box = await page.locator(control).first().boundingBox();
    expect(box).not.toBeNull();
    // On screen horizontally and not below the fold. A control the layout has
    // pushed off the right edge is as unreachable as one pushed off the bottom,
    // and only one of the two is ever looked for.
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    expect(box!.y + box!.height).toBeLessThanOrEqual(640);

    await page.close();
  }, 180_000);

  /**
   * 007/T051 — EDIT PROFILE IS LONGER THAN THE SCREEN, MEASURED BEFORE DECIDING.
   *
   * The rebuild moved Save into the header, which puts the screen's primary
   * action above the fold by construction. Everything BELOW it — four
   * notification switches, the feed-signals disclosure, and the delete-account
   * control — is a different question, and run 36 is the reason it gets
   * measured rather than reasoned about: I turned `scroll` on for seven
   * unmeasured screens on a "same class of defect" argument and took the device
   * suite from 18/19 to 1/19.
   *
   * So this records WHERE THE FOLD FALLS on the shortest supported screen. It
   * does not assert everything fits — the screen is genuinely taller than 640
   * points and always was, before this rebuild too. What it asserts is the part
   * that matters and is fixable without a `ScrollView`: Save is reachable, and
   * the two destructive controls are not silently the ones off the bottom
   * without anybody having looked.
   */
  it('007/T051 edit profile keeps Save above the fold, and delete-account reachable', async () => {
    const person = await actor(`ep${Math.random().toString(36).slice(2, 8)}`);
    page = await browser.newPage({ viewport: { width: 360, height: 640 } });
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, person.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="tab-profile"]', { timeout: 30_000 });
    await page.click('[data-testid="tab-profile"]');
    await page.click('[data-testid="open-edit-profile"]');
    await page.waitForSelector('[data-testid="edit-profile-screen"]', { timeout: 30_000 });

    const save = (await page.locator('[data-testid="save-profile"]').boundingBox())!;
    expect(save.y).toBeGreaterThanOrEqual(0);
    expect(save.y + save.height).toBeLessThanOrEqual(640);

    // And the bottom of the screen is BELOW the fold — measured at 788 against
    // 640 — so this is the failing case, not a screen that happens to fit. A
    // future layout that made it fit must not leave the next assertion passing
    // vacuously.
    const del = (await page.locator('[data-testid="delete-account"]').boundingBox())!;
    expect(del.y + del.height).toBeGreaterThan(640);

    // So an ANCESTOR OF THE ELEMENT SCROLLS. Not `scrollIntoViewIfNeeded`,
    // which is the trap the block-control test above records: Playwright
    // scrolls the DOCUMENT, and a browser page scrolls where a React Native
    // screen does not.
    const scrollable = await page.locator('[data-testid="delete-account"]').evaluate((el: unknown) => {
      type Node = { parentElement: Node | null; scrollHeight: number; clientHeight: number };
      const g = globalThis as unknown as { getComputedStyle(n: unknown): { overflowY: string } };
      for (let n = el as Node | null; n; n = n.parentElement) {
        const overflowY = g.getComputedStyle(n).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
          return true;
        }
      }
      return false;
    });
    expect(scrollable).toBe(true);

    await page.close();
  }, 180_000);

  /**
   * 007/SC-008, T070b — FOUR OR MORE POSTS VISIBLE WITHOUT SCROLLING.
   *
   * The owner's instruction was "a few posts in a screen, like xiaohongshu", and
   * a criterion phrased that way is one somebody counts by eye once and never
   * again. Measured at a fixed viewport instead: the cards whose boxes fall
   * entirely inside 640 points.
   *
   * Four is the floor rather than the target. The waterfall staggers, so the
   * exact number depends on the aspect ratios that happen to be on the page —
   * asserting a specific count would be asserting the fixture.
   */
  it('SC-008 four or more posts are visible on the feed without scrolling', async () => {
    const author = await actor('sc008author');
    const reader = await actor('sc008reader');
    const interest = (await reader.data.interests.listTop({ limit: 1 })).items[0]!;
    for (let i = 0; i < 8; i++) {
      await publishReadyImage(author, [interest.interestId], { caption: `sc008 ${i}` });
    }
    await reader.data.interests.follow(interest.interestId);

    page = await browser.newPage({ viewport: { width: 360, height: 640 } });
    await page.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, reader.token);
    await page.goto(web.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="home-feed-screen"]', { timeout: 30_000 });
    await page.waitForSelector('[data-testid^="post-media-"]', { timeout: 30_000 });

    /**
     * VISIBLE MEANS THE PICTURE IS ON SCREEN, and the definition is chosen
     * before the number rather than after it. In a waterfall a post IS its
     * image: that is what the eye sorts by and what a person taps.
     *
     * Counting whole CARD boxes instead fails on a card whose last 30 points of
     * PADDING fall below the fold — measured, that is exactly the case at this
     * viewport — and calling such a post invisible while its photograph, title,
     * byline and interest are all on screen would be measuring the wrong thing
     * carefully.
     *
     * The numbers, at 360x640 with the app's own chrome: the list starts at
     * y=118 and is 461 points tall; cards are 164x270 with 164 points of media.
     * Rows land at y=118 and y=400, so four media boxes end at 282 and 564,
     * both inside the fold, while the second row's card box ends at 670.
     */
    const media = await page.locator('[data-testid^="post-media-"]').all();
    const boxes = await Promise.all(media.map((frame) => frame.boundingBox()));
    const visible = boxes.filter((box) => box && box.y >= 0 && box.y + box.height <= 640);

    // The boxes are in the message, so a failure says where the fold fell
    // rather than only that it fell somewhere.
    expect({ visible: visible.length, boxes: boxes.slice(0, 6) }).toMatchObject({
      visible: expect.any(Number),
    });
    expect(visible.length).toBeGreaterThanOrEqual(4);

    /**
     * And the columns are SIDE BY SIDE, so the four are two rows of two rather
     * than four stacked. Without this the assertion above passes on a
     * single-column list, which is the layout 007 replaced.
     */
    const xs = new Set(visible.map((box) => Math.round(box!.x)));
    expect(xs.size).toBeGreaterThanOrEqual(2);

    await page.close();
  }, 240_000);
});
