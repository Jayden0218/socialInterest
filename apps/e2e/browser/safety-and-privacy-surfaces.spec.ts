import type { Browser, Page } from 'playwright';
import { launchChromium } from '../support/browser';
import { startWebServer, type WebServer } from '../support/web-server';
import { baseUrl } from '../support/base-url';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

/**
 * 008/US13 and US14 — THE TWO SURFACES BOTH STORIES COULD SHIP WITHOUT.
 *
 * A private-account toggle whose request queue nobody can answer, and a
 * moderation notice whose Appeal button does nothing, both satisfy every
 * component test in the repository: the screens render, the props arrive, the
 * handlers exist. What neither a screen test nor a container test can say is
 * whether the path from the app's MAIN SCREEN reaches them and whether the tap
 * reaches the server.
 *
 * That is the gap 003 found (`ProfileContainer` loading the wrong person with a
 * follow button wired to `() => undefined`, every screen test green), and it is
 * why 005 and 008 each spent two emulator runs on navigation facts a browser
 * settles in seconds. This runs before the device does, so the device spends its
 * minutes on what only a device can answer.
 *
 * Asserted through the SERVICE at the end of each case, never through the view:
 * a control that flipped local state and never reached the API would look
 * identical here, and is precisely the failure both stories are about.
 */
describe('008/US13, US14 - the privacy and safety surfaces are reachable and real', () => {
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

  const openEditProfile = async (token: string): Promise<Page> => {
    const p = await browser.newPage({ viewport: { width: 414, height: 896 } });
    await p.addInitScript((t) => {
      (globalThis as unknown as { localStorage: { setItem(k: string, v: string): void } })
        .localStorage.setItem('sih.auth.token', t as string);
    }, token);
    await p.goto(web.url, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('[data-testid="tab-profile"]', { timeout: 30_000 });
    await p.click('[data-testid="tab-profile"]');
    await p.click('[data-testid="open-edit-profile"]');
    await p.waitForSelector('[data-testid="edit-profile-screen"]', { timeout: 30_000 });
    return p;
  };

  it('US13 the privacy toggle reaches the server and the request queue can be answered', async () => {
    const owner = await actor('privsurfaceowner');
    const asker = await actor('privsurfaceasker');

    page = await openEditProfile(owner.token);

    // FR-043. The switch, and the sentence saying what it does to what is
    // already published — the question anybody flipping it is actually asking.
    await page.waitForSelector('[data-testid="account-privacy"]', { timeout: 30_000 });
    await page.click('[data-testid="account-privacy-switch"]');
    await page.click('[data-testid="save-profile"]');

    /**
     * THE SERVER'S OWN ANSWER. A toggle that set local state and never sent the
     * patch renders identically to one that worked.
     */
    await (async () => {
      for (let i = 0; i < 60; i++) {
        const me = await owner.data.session.me();
        if (me.accountPrivacy === 'private') return;
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error('the privacy toggle never reached the server');
    })();

    // Now somebody asks. The follow becomes a REQUEST, which is the third state
    // `viewerIsFollowing` cannot express.
    await asker.data.people.follow(owner.handle);
    const asAsker = await asker.data.people.get(owner.handle);
    expect({
      following: asAsker.viewerIsFollowing,
      state: asAsker.viewerFollowState,
    }).toEqual({ following: false, state: 'pending' });

    // Back to Edit profile, where the queue is. Reloading rather than reusing
    // the open page, because the list is read on mount and this is the path a
    // person actually takes.
    await page.close();
    page = await openEditProfile(owner.token);
    await page.waitForSelector(`[data-testid="approve-follow-request-${asker.handle}"]`, {
      timeout: 30_000,
    });
    await page.click(`[data-testid="approve-follow-request-${asker.handle}"]`);

    await (async () => {
      for (let i = 0; i < 60; i++) {
        const fresh = await asker.data.people.get(owner.handle);
        if (fresh.viewerFollowState === 'following') return;
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error('approving the request never reached the server');
    })();

    /*
      AND BACK TO OPEN, which run 58 is the argument for.

      `34-private-account` turned the device's account private and left it
      there, so every later ANONYMOUS read saw a private account — correctly,
      because a public post by a private account is evaluated by the followers
      rule (FR-044). The runner's post-journey check asks the place page with
      no token, and it failed: not a defect, US13 working on a surface nobody
      had thought about it on.

      A toggle is not idempotent and flows share ONE SERVER — 005/J-20's
      lesson, in a new place. So the flow puts the account back, and this is
      the browser half of the same claim: the switch works in BOTH directions,
      the way 27-set-avatar covers set AND removed.
    */
    await page.click('[data-testid="account-privacy-switch"]');
    await page.click('[data-testid="save-profile"]');
    await (async () => {
      for (let i = 0; i < 60; i++) {
        const me = await owner.data.session.me();
        if (me.accountPrivacy === 'open') return;
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error('the privacy toggle never went back to open');
    })();

    await page.close();
  }, 240_000);

  it('US14 a removal notice is reachable from the main screen and the appeal reaches the server', async () => {
    const author = await actor('appealsurfaceauthor');
    const reporter = await actor('appealsurfacereporter');
    const operator = await actor('appealsurfaceoperator', { isOperator: true });
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;

    const postId = await publishReadyImage(author, [interest.interestId], {
      caption: 'about to be removed',
    });
    const filed = await reporter.data.safety.report({
      subjectType: 'post',
      subjectId: postId,
      reason: 'explicit',
    });
    await operator.data.safety.decide(filed.reportId, {
      state: 'actioned',
      action: 'remove_content',
      note: 'internal: browser fixture',
    });

    const notices = await author.data.safety.moderationNotices({ limit: 50 });
    const notice = notices.items.find((n) => n.subjectId === postId);
    if (!notice) throw new Error('setup: no moderation notice reached the author');

    page = await openEditProfile(author.token);

    /**
     * CONSTITUTION IV — THE ROUTE HAS TO BE FINDABLE. From the main screen, no
     * deep link, no guidance: profile tab, edit, "Removed content".
     */
    await page.click('[data-testid="open-moderation-notices"]');
    await page.waitForSelector('[data-testid="moderation-notices-screen"]', { timeout: 30_000 });
    await page.waitForSelector(`[data-testid="moderation-notice-${notice.actionId}"]`, {
      timeout: 30_000,
    });

    /**
     * FR-046, IN WORDS. The server sends `post` / `remove_content` / `explicit`;
     * rendering those raw would tell somebody their content was removed in the
     * moderation queue's own vocabulary. Asserted on the TEXT for that reason.
     */
    const text = await page.textContent(`[data-testid="moderation-notice-${notice.actionId}"]`);
    expect(text).toContain('Your post was removed');
    expect(text).toContain('explicit content');
    // And never the moderator's internal note — the screen cannot show what the
    // API does not send, but this is where that would first become visible.
    expect(text).not.toContain('browser fixture');

    await page.click(`[data-testid="appeal-${notice.actionId}"]`);
    await page.fill('[data-testid="appeal-body"]', 'It was a photograph of a sunset.');
    await page.click('[data-testid="submit-appeal"]');

    // THE SERVICE. A button that cleared the form and never posted looks the same.
    await (async () => {
      for (let i = 0; i < 60; i++) {
        const mine = await author.data.safety.appeals({ limit: 50 });
        if (mine.items.some((a) => a.subjectId === postId)) return;
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error('the appeal never reached the server');
    })();

    // The state replaces the button, because the container re-reads: offering
    // the button again would produce a 409 that reads as a bug.
    await page.waitForSelector(`[data-testid="appeal-state-${notice.actionId}"]`, {
      timeout: 30_000,
    });

    await page.close();
  }, 240_000);
});
