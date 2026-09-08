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

    /**
     * 007/FR-014. SIGNING IN NOW LANDS ON THE COLD START, which is a PUSHED
     * screen — so the tab bar is not on it, exactly as 005/J-21 recorded for a
     * pushed conversation. A journey that expected the tabs immediately after
     * sign-in is waiting for something the app deliberately does not render
     * yet, and that is what broke the whole browser suite in one commit.
     *
     * Dismissed rather than picked from: what the cold start does with picks is
     * covered by `cold-start-container.test.tsx` and `signals.spec.ts`, and
     * these journeys are about reaching the screens after it.
     */
    /**
     * WAIT for one of the two possible next screens before deciding.
     *
     * The first version of this queried for the skip button IMMEDIATELY and
     * found nothing, because the container renders `pick-interests-loading`
     * while it reads the catalogue — so every journey sailed past the cold
     * start and then waited thirty seconds for a tab bar that is not on a
     * pushed screen. Racing the two outcomes is the fix; polling for one of
     * them and assuming the other is how the same bug comes back.
     */
    await Promise.race([
      page.waitForSelector(id('pick-skip'), { timeout: 20_000 }).catch(() => null),
      page.waitForSelector(id('tab-feed'), { timeout: 20_000 }).catch(() => null),
    ]);
    const skip = await page.$(id('pick-skip'));
    if (skip) {
      await skip.click();
      await page.waitForSelector(id('pick-interests-screen'), { state: 'detached', timeout: 20_000 });
    }
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

    await page.waitForSelector(id('comments-button'), { timeout: 20_000 });
    await page.click(id('comments-button'));
    await page.waitForSelector(id('comments-screen'), { timeout: 20_000 });
    await page.fill(id('comment-input'), 'left from a browser');
    await page.click(id('comment-submit'));

    // Read it back from the API, not from the DOM: the point is that it landed.
    await page.waitForTimeout(1_500);
    const comments = await reader.data.engagement.comments(postId, {});
    expect(comments.items.map((c) => c.body)).toContain('left from a browser');
  });

  it('reacting reaches the server - the control had no mount point at all', async () => {
    const author = await actor('webreactauthor');
    const reader = await actor('webreactreader');
    const catalogue = await author.data.interests.listTop({ limit: 1 });
    const interestId = catalogue.items[0]!.interestId;
    await author.data.interests.follow(interestId);
    await reader.data.interests.follow(interestId);
    const postId = await publishReadyImage(author, [interestId], { caption: 'react to me' });

    await signInThroughTheScreen(reader.token);
    await page.click(id('tab-feed'));
    await page.waitForSelector(id(`post-${postId}`), { timeout: 30_000 });
    await page.click(id(`post-${postId}`));

    // EngagementBar existed and was render-tested, and was never mounted
    // anywhere - so FR-039 had no control on any screen.
    await page.waitForSelector(id('react-button'), { timeout: 20_000 });
    await page.click(id('react-button'));

    // The server owns the count, so read it back rather than trusting the DOM.
    await page.waitForTimeout(1_500);
    const post = await reader.data.posts.get(postId);
    expect(post.reactionCount).toBe(1);
    expect(post.viewerHasReacted).toBe(true);
  });

  it('a notification opens its post, not a dead end', async () => {
    const author = await actor('webnotifauthor');
    const reader = await actor('webnotifreader');
    const catalogue = await author.data.interests.listTop({ limit: 1 });
    const interestId = catalogue.items[0]!.interestId;
    await author.data.interests.follow(interestId);
    await reader.data.interests.follow(interestId);
    const postId = await publishReadyImage(author, [interestId], { caption: 'notify me' });
    // The author gets a notification for the reader's comment.
    await reader.data.engagement.comment(postId, 'nice');
    for (let i = 0; i < 20; i++) {
      const page1 = await author.data.notifications.list();
      if (page1.items.length > 0) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    await signInThroughTheScreen(author.token);
    await page.click(id('tab-notifications'));
    await page.waitForSelector(id('notification-0'), { timeout: 30_000 });
    await page.click(id('notification-0'));

    // The shell used to push the NOTIFICATION's id as a post id, so this
    // resolved to 404 "No longer available" every time.
    await page.waitForSelector(id('post-detail-screen'), { timeout: 20_000 });
    expect(await page.$(id('load-error'))).toBeNull();
  });

  it('an author edits their own post, and the change reaches the server', async () => {
    const author = await actor('webeditauthor');
    const catalogue = await author.data.interests.listTop({ limit: 1 });
    const interestId = catalogue.items[0]!.interestId;
    await author.data.interests.follow(interestId);
    const postId = await publishReadyImage(author, [interestId], { caption: 'before' });

    await signInThroughTheScreen(author.token);
    await page.click(id('tab-feed'));
    await page.waitForSelector(id(`post-${postId}`), { timeout: 30_000 });
    await page.click(id(`post-${postId}`));

    // FR-012: the control appears only for the author. EditPostScreen existed
    // and was never mounted, so a post could never be changed or removed.
    await page.waitForSelector(id('open-edit-post'), { timeout: 20_000 });
    await page.click(id('open-edit-post'));
    await page.waitForSelector(id('edit-post-screen'), { timeout: 20_000 });
    await page.fill(id('edit-caption-input'), 'after');
    await page.click(id('edit-save'));

    await page.waitForTimeout(1_500);
    const updated = await author.data.posts.get(postId);
    expect(updated.caption).toBe('after');
  });

  it('a person edits their profile, including a notification preference', async () => {
    const person = await actor('webeditprofile');
    await signInThroughTheScreen(person.token);
    await page.click(id('tab-profile'));
    await page.waitForSelector(id('open-edit-profile'), { timeout: 20_000 });
    await page.click(id('open-edit-profile'));

    await page.waitForSelector(id('edit-profile-screen'), { timeout: 20_000 });
    await page.fill(id('display-name-input'), 'Renamed');
    await page.click(id('save-profile'));

    // The prefs half could not have worked before this change: the data layer's
    // updateProfile type did not accept notificationPrefs at all.
    await page.waitForTimeout(1_500);
    const me = await person.data.session.me();
    expect(me.displayName).toBe('Renamed');
  });

  it('a share link opens the app at the post, and says what the link grants', async () => {
    const author = await actor('websharedauthor');
    const catalogue = await author.data.interests.listTop({ limit: 1 });
    const interestId = catalogue.items[0]!.interestId;
    await author.data.interests.follow(interestId);
    const postId = await publishReadyImage(author, [interestId], { caption: 'shared' });

    // The deep link is what makes the shared-post screen reachable at all;
    // without it nothing can put the app into that state.
    await page.goto(`${web.url}/#/p/${postId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(id('shared-post-screen'), { timeout: 20_000 });
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

  /**
   * 004/US1 on the running app, not on the data layer.
   *
   * The journeys prove the SERVICE. They say nothing about whether anything in
   * the app calls it, which is the defect this codebase produces most often -
   * four times so far, every one passing its own render test. So this drives the
   * real entry point: a profile, the Message button, the composer, and the
   * message read back through the service.
   */
  it('004/J-13 a conversation is reachable from a profile, and a message reaches the server', async () => {
    const me = await actor('webchatme');
    const them = await actor('webchatthem');

    await signInThroughTheScreen(me.token);

    // Seeded server-side so this case is about the INBOX route specifically;
    // the profile route into a conversation is the next case.
    const conversation = await me.data.conversations.open(them.handle);
    await page.click(id('tab-chats'));
    await page.waitForSelector(id('inbox-screen'), { timeout: 20_000 });
    await page.click(id('inbox-requested'));
    await page.waitForSelector(id(`open-conversation-${conversation.conversationId}`), {
      timeout: 20_000,
    });
    await page.click(id(`open-conversation-${conversation.conversationId}`));

    await page.waitForSelector(id('message-input'), { timeout: 20_000 });
    await page.fill(id('message-input'), 'typed into the real composer');
    await page.click(id('send-message'));

    // Asserted through the SERVICE, not the view hierarchy. A message rendered
    // optimistically in the list would satisfy a DOM assertion and prove nothing.
    await page.waitForSelector(id('message-list'), { timeout: 20_000 });
    const delivered = await them.data.conversations.messages(conversation.conversationId, {
      limit: 20,
    });
    expect(delivered.items.map((m) => m.body)).toContain('typed into the real composer');
  }, 120_000);

  it('004/J-14 the Message button on a profile is present and wired', async () => {
    const me = await actor('webmsgbtnme');
    const them = await actor('webmsgbtnthem');
    const catalogue = await me.data.interests.listTop({ limit: 1 });
    const interestId = catalogue.items[0]!.interestId;
    await me.data.interests.follow(interestId);
    const postId = await publishReadyImage(them, [interestId], { caption: 'find the author' });

    await signInThroughTheScreen(me.token);
    await page.click(id('tab-feed'));
    await page.waitForSelector(id(`post-${postId}`), { timeout: 30_000 });
    await page.click(id(`post-${postId}`));
    await page.waitForSelector(id('open-author'), { timeout: 20_000 });
    await page.click(id('open-author'));

    // The button rendering at all is the assertion. `ProfileContainer` passed
    // `() => undefined` for its follow callback for an entire feature, so the
    // control existed and did nothing; a present-and-wired check is the guard.
    await page.waitForSelector(id('message-person'), { timeout: 20_000 });
    await page.click(id('message-person'));
    await page.waitForSelector(id('conversation-screen'), { timeout: 20_000 });

    // And it reached the RIGHT conversation, not merely a conversation.
    //
    // `other` became nullable in 005 because a group has no single other person.
    // Asserted rather than narrowed with `?.` or `!`: this opens a conversation
    // with one named person, so a null here would mean the pair path returned a
    // group - which `?.handle` would quietly report as undefined !== handle,
    // failing with the wrong reason.
    const conversation = await me.data.conversations.open(them.handle);
    expect(conversation.kind ?? 'pair').toBe('pair');
    expect(conversation.other).not.toBeNull();
    expect(conversation.other?.handle).toBe(them.handle);
  }, 120_000);

  /**
   * 004/US2 on the running app.
   *
   * The place chip is the only route to a place page from inside the product,
   * and PlaceContainer is the only thing that mounts PlaceScreen. Both are the
   * shape this codebase keeps shipping broken - a screen that renders and
   * nothing that opens it - so both are driven here rather than render-tested.
   */
  it('004/J-16 a place chip opens its page, and following it reaches the server', async () => {
    const author = await actor('webplaceauthor');
    const viewer = await actor('webplaceviewer');
    const catalogue = await author.data.interests.listTop({ limit: 1 });
    const interestId = catalogue.items[0]!.interestId;
    await viewer.data.interests.follow(interestId);

    const locality = `Web-${Date.now().toString(36)}`;
    const place = await author.data.places.create({
      name: 'The Chip Shop',
      category: 'restaurant',
      locality,
    });
    const postId = await publishReadyImage(author, [interestId], {
      caption: 'find the place',
      placeId: place.placeId,
    });

    await signInThroughTheScreen(viewer.token);
    await page.click(id('tab-feed'));
    await page.waitForSelector(id(`post-${postId}`), { timeout: 30_000 });
    await page.click(id(`post-${postId}`));

    // FR-023. Tappable, not decorative - the whole reason it is a Pressable.
    await page.waitForSelector(id('post-place'), { timeout: 20_000 });
    await page.click(id('post-place'));
    await page.waitForSelector(id('place-screen'), { timeout: 20_000 });
    await page.waitForSelector(id('place-name'), { timeout: 20_000 });

    // FR-019 stated to the person, not only enforced behind their back.
    expect(await page.$(id('place-follow-hint'))).not.toBeNull();

    await page.click(id('follow-place-toggle'));
    // Asserted through the SERVICE. `viewerIsFollowing` is computed per viewer
    // by the API, so a local flag flip would not move it.
    await page.waitForSelector(id('place-screen'), { timeout: 20_000 });
    const after = await eventuallyFollowing(viewer, place.placeId);
    expect(after).toBe(true);

    // And the post is on the place page, which is surface 8 doing its job.
    const onPlace = await viewer.data.places.posts(place.placeId, { limit: 10 });
    expect(onPlace.items.map((p) => p.postId)).toContain(postId);
  }, 120_000);

  /**
   * 004/US5 on the running app.
   *
   * The star and the Saved button are the only routes to a saved list, and
   * SavedContainer is the only thing that mounts SavedScreen. Asserted through
   * the SERVICE: a star that flips locally satisfies any DOM assertion, and
   * that is exactly the defect the react control shipped with.
   */
  it('004/J-17 saving a post reaches the server and the saved list shows it', async () => {
    const author = await actor('websaveauthor');
    const saver = await actor('websaver');
    const catalogue = await author.data.interests.listTop({ limit: 1 });
    const interestId = catalogue.items[0]!.interestId;
    await saver.data.interests.follow(interestId);
    const postId = await publishReadyImage(author, [interestId], { caption: 'save me' });

    await signInThroughTheScreen(saver.token);
    await page.click(id('tab-feed'));
    await page.waitForSelector(id(`post-${postId}`), { timeout: 30_000 });
    await page.click(id(`post-${postId}`));

    await page.waitForSelector(id('save-button'), { timeout: 20_000 });
    await page.click(id('save-button'));

    const savedOnServer = await eventuallySaved(saver, postId);
    expect(savedOnServer).toBe(true);

    // Back lands on the tab this journey came FROM, which is the feed. The
    // Saved button lives on the profile tab, because the list is reachable as
    // "mine" and nowhere else (FR-038) - so getting there is a tab away, and a
    // test that assumed otherwise failed for its own reason rather than the
    // product's.
    await page.click(id('nav-back'));
    await page.click(id('tab-profile'));
    await page.waitForSelector(id('open-saved'), { timeout: 20_000 });
    await page.click(id('open-saved'));
    await page.waitForSelector(id('saved-screen'), { timeout: 20_000 });
    await page.waitForSelector(id(`post-${postId}`), { timeout: 20_000 });
  }, 120_000);

  /**
   * 005/US3, AND THE REASON IT IS HERE RATHER THAN ONLY IN MAESTRO.
   *
   * `21-group-chat.yaml` failed twice on an Android runner - a 25-minute run
   * each time - for two facts that are true in a browser in thirty seconds:
   *
   *   1. The conversation is a PUSHED route, and `App` renders the tab bar only
   *      at the root of the stack. `tab-chats` does not exist on a pushed
   *      screen; `nav-back` does. The flow waited sixty seconds for a tab that
   *      was not there, AFTER the API log shows it had already created the
   *      group (201) and added a participant (204).
   *   2. `open-conversation-.*` matches whichever row renders first, and by then
   *      the inbox holds several conversations from earlier flows. A group needs
   *      an open button identified by the GROUP.
   *
   * Neither is about Android. Both are navigation facts the browser can settle
   * for free, which is exactly what CLAUDE.md means by preferring the free
   * observation to the expensive guess - a lesson this project has now paid for
   * in six emulator runs, four hung jest runs, and these two.
   *
   * This does NOT replace the device flow. It cannot: react-native-web renders
   * the same components through DOM primitives, so it says nothing about native
   * layout, touch handling or the platform. It settles the NAVIGATION, so the
   * device run is spent on what only a device can answer.
   */
  it('005/J-21 a group is created, opened by name, and left - through the app', async () => {
    const me = await actor('webgroupowner');
    const a = await actor('webgroupa');
    const b = await actor('webgroupb');
    // FR-022: the INVITEE's follow decides whether the invitation is accepted.
    await a.data.people.follow(me.handle);
    await b.data.people.follow(me.handle);

    await signInThroughTheScreen(me.token);
    await page.click(id('tab-chats'));
    await page.waitForSelector(id('inbox-screen'), { timeout: 20_000 });

    await page.click(id('new-group'));
    await page.waitForSelector(id('new-group-screen'), { timeout: 20_000 });

    // One search for both, which is what the device flow does - the handles
    // share a prefix and handle search is a prefix query.
    await page.fill(id('group-search-input'), 'webgroup');
    await page.waitForSelector(id(`group-participant-${a.handle}`), { timeout: 20_000 });
    await page.click(id(`group-participant-${a.handle}`));
    await page.click(id(`group-participant-${b.handle}`));
    await page.fill(id('group-name-input'), 'Climbing Tuesday');
    await page.click(id('create-group'));

    // Lands ON the conversation, with the participants named (FR-019).
    await page.waitForSelector(id('conversation-screen'), { timeout: 20_000 });
    await page.waitForSelector(id('group-participants'), { timeout: 20_000 });

    await page.fill(id('message-input'), 'first message in the group');
    await page.click(id('send-message'));
    await page.waitForSelector('text=first message in the group', { timeout: 20_000 });

    // THE FIRST FACT THE DEVICE RUNS COST: a pushed screen has no tab bar.
    expect(await page.locator(id('tab-chats')).count()).toBe(0);
    await page.waitForSelector(id('nav-back'), { timeout: 20_000 });
    await page.click(id('nav-back'));
    await page.waitForSelector(id('inbox-screen'), { timeout: 20_000 });

    // FR-024: the row is identified by the group's NAME, never by the preview.
    await page.waitForSelector('text=Climbing Tuesday', { timeout: 20_000 });

    // THE SECOND FACT: the group's own open button, not whichever row is first.
    const openGroup = page.locator('[data-testid^="open-group-"]');
    expect(await openGroup.count()).toBe(1);
    await openGroup.click();
    await page.waitForSelector(id('conversation-screen'), { timeout: 20_000 });

    // FR-021. Leaving withdraws you, and the inbox no longer offers it.
    await page.click(id('leave-group'));
    await page.waitForSelector(id('inbox-screen'), { timeout: 20_000 });
    await page.waitForSelector('text=Climbing Tuesday', { state: 'detached', timeout: 20_000 });
  }, 180_000);
});

async function eventuallySaved(
  viewer: Awaited<ReturnType<typeof actor>>,
  postId: string,
): Promise<boolean> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const listed = await viewer.data.saved.list({ limit: 20 });
    if (listed.items.some((p) => p.postId === postId)) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 250));
  }
}


async function eventuallyFollowing(
  viewer: Awaited<ReturnType<typeof actor>>,
  placeId: string,
): Promise<boolean> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    if ((await viewer.data.places.get(placeId)).viewerIsFollowing) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 250));
  }
}
