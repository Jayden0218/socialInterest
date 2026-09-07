import { actor, type Actor } from '../support/client';
import { publishReadyImage } from '../support/publish';
import { consistently, eventually } from '../support/eventually';

/**
 * 004/US1 over HTTP, driving the app's own data layer.
 *
 * The whole point of this file: a generated client and contract tests are both
 * derived from one OpenAPI document, so they agree with each other by
 * construction. Every defect this product has actually shipped was invisible to
 * that and visible to a request.
 */

const send = async (from: Actor, conversationId: string, body: string) =>
  from.data.conversations.send(conversationId, { body });

describe('004/US1 - two people can talk', () => {
  it('J-13 a message sent by one person is read by the other (FR-001)', async () => {
    const a = await actor('chatA');
    const b = await actor('chatB');
    await b.data.people.follow(a.handle); // so it is not a request (FR-003)

    const conv = await a.data.conversations.open(b.handle);
    await send(a, conv.conversationId, 'hello over HTTP');

    const inbox = await b.data.conversations.list({ state: 'accepted' });
    const row = inbox.items.find((c) => c.conversationId === conv.conversationId);
    expect(row).toBeDefined();
    expect(row!.unreadCount).toBe(1);

    const page = await b.data.conversations.messages(conv.conversationId);
    expect(page.items.map((m) => m.body)).toContain('hello over HTTP');
  });

  it('J-13 opening a conversation twice returns the same thread (FR-001, research R8)', async () => {
    const a = await actor('chatIdemA');
    const b = await actor('chatIdemB');
    const first = await a.data.conversations.open(b.handle);
    const second = await a.data.conversations.open(b.handle);
    // And from the OTHER side: the id is derived from the sorted pair, so it
    // cannot depend on who asked.
    const fromB = await b.data.conversations.open(a.handle);
    expect(second.conversationId).toBe(first.conversationId);
    expect(fromB.conversationId).toBe(first.conversationId);
  });

  it('SC-001 delivery with the conversation open is under 2 seconds (FR-011)', async () => {
    const a = await actor('pollA');
    const b = await actor('pollB');
    await b.data.people.follow(a.handle);
    const conv = await a.data.conversations.open(b.handle);
    await send(a, conv.conversationId, 'first');
    const seen = await b.data.conversations.messages(conv.conversationId);
    const cursor = seen.items.at(-1)!.messageId;

    // Arm the long-poll BEFORE the message exists, which is the case that
    // matters: a poll that only returns already-stored rows proves nothing about
    // delivery latency.
    const started = Date.now();
    const waiting = b.data.conversations.messages(conv.conversationId, {
      after: cursor,
      waitSeconds: 25,
    });
    await new Promise((r) => setTimeout(r, 150));
    await send(a, conv.conversationId, 'second');

    const page = await waiting;
    const elapsed = Date.now() - started;
    expect(page.items.map((m) => m.body)).toEqual(['second']);
    expect(elapsed).toBeLessThan(2000);
  }, 30_000);

  it('SC-001 a quiet conversation times out with an empty page, not an error', async () => {
    const a = await actor('quietA');
    const b = await actor('quietB');
    const conv = await a.data.conversations.open(b.handle);
    const page = await b.data.conversations.messages(conv.conversationId, { waitSeconds: 1 });
    expect(page.items).toEqual([]);
  }, 15_000);

  it('SC-003 an unsolicited first message lands in Requests and notifies nobody (FR-003, FR-004)', async () => {
    const stranger = await actor('reqStranger');
    const target = await actor('reqTarget');

    const conv = await stranger.data.conversations.open(target.handle);
    await send(stranger, conv.conversationId, 'do you want this');

    const accepted = await target.data.conversations.list({ state: 'accepted' });
    const requested = await target.data.conversations.list({ state: 'requested' });
    expect(accepted.items.map((c) => c.conversationId)).not.toContain(conv.conversationId);
    expect(requested.items.map((c) => c.conversationId)).toContain(conv.conversationId);

    /**
     * ZERO notifications - not "filtered from the list", not created.
     *
     * `consistently`, not a single read. Event delivery is asynchronous, so
     * checking once immediately after the send passes before anything could
     * have arrived: green, worthless, and indistinguishable from a real pass.
     */
    await consistently(
      () => target.data.notifications.list({ limit: 50 }),
      (n) => n.items.filter((i) => i.kind === 'message').length === 0,
      { forMs: 1500, describe: 'no message notification for a REQUESTED conversation' },
    );
  });

  it('FR-005 the initiator may not send a second message before it is answered', async () => {
    const a = await actor('oneShotA');
    const b = await actor('oneShotB');
    const conv = await a.data.conversations.open(b.handle);
    await send(a, conv.conversationId, 'first and only');
    await expect(send(a, conv.conversationId, 'and another')).rejects.toMatchObject({ status: 409 });
  });

  it('FR-004 accepting turns notifications on for that conversation', async () => {
    const a = await actor('acceptA');
    const b = await actor('acceptB');
    const conv = await a.data.conversations.open(b.handle);
    await send(a, conv.conversationId, 'may I');
    await b.data.conversations.accept(conv.conversationId);
    await send(a, conv.conversationId, 'thanks');

    await eventually(
      () => b.data.notifications.list({ limit: 50 }),
      (n) => n.items.some((i) => i.kind === 'message'),
      { describe: 'a message notification once the conversation is accepted' },
    );
    const accepted = await b.data.conversations.list({ state: 'accepted' });
    expect(accepted.items.map((c) => c.conversationId)).toContain(conv.conversationId);
  });

  it('FR-005 a reply IS an acceptance, so the initiator is not blocked forever', async () => {
    const a = await actor('replyAcceptsA');
    const b = await actor('replyAcceptsB');
    const conv = await a.data.conversations.open(b.handle);
    await send(a, conv.conversationId, 'may I');
    await send(b, conv.conversationId, 'you may');
    // Without this the conversation stays `requested` forever and A is refused
    // with "wait for a reply" - to a reply they already got.
    await send(a, conv.conversationId, 'thank you');

    const page = await b.data.conversations.messages(conv.conversationId);
    expect(page.items.map((m) => m.body)).toEqual(['may I', 'you may', 'thank you']);
    expect((await b.data.conversations.get(conv.conversationId)).state).toBe('accepted');
  });

  it('FR-005 a declined sender is not told, and their sends go nowhere', async () => {
    const a = await actor('declineA');
    const b = await actor('declineB');
    const conv = await a.data.conversations.open(b.handle);
    await send(a, conv.conversationId, 'hello?');
    await b.data.conversations.decline(conv.conversationId);

    // Accepted, not refused - and 202 carries no body, so there is nothing to
    // assert about the return value. What matters is that it does not REJECT
    // (a sender who learns they were declined has a reason to come back with
    // another account) and that nothing was stored.
    await send(a, conv.conversationId, 'hello again');

    const messages = await b.data.conversations.messages(conv.conversationId);
    expect(messages.items.map((m) => m.body)).toEqual(['hello?']);
  });

  it('SC-004 a block severs the conversation in both directions, indistinguishably (FR-006)', async () => {
    const a = await actor('blockA');
    const b = await actor('blockB');
    await b.data.people.follow(a.handle);
    const conv = await a.data.conversations.open(b.handle);
    await send(a, conv.conversationId, 'before the block');

    await b.data.safety.block(a.handle);

    // Both sides, both operations, all 404 - identical to a conversation that
    // never existed, so the block is not disclosed.
    await expect(a.data.conversations.messages(conv.conversationId)).rejects.toMatchObject({ status: 404 });
    await expect(b.data.conversations.messages(conv.conversationId)).rejects.toMatchObject({ status: 404 });
    await expect(send(a, conv.conversationId, 'after')).rejects.toMatchObject({ status: 404 });
    await expect(send(b, conv.conversationId, 'after')).rejects.toMatchObject({ status: 404 });
  });

  it('FR-041 an outsider cannot read a conversation, and is told 404 not 403', async () => {
    const a = await actor('outA');
    const b = await actor('outB');
    const outsider = await actor('outC');
    const conv = await a.data.conversations.open(b.handle);
    await send(a, conv.conversationId, 'private');
    await expect(outsider.data.conversations.messages(conv.conversationId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('FR-009 a shared post is resolved PER READER through the visibility boundary', async () => {
    const author = await actor('shareAuthor');
    const reader = await actor('shareReader');
    await reader.data.people.follow(author.handle);
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId]);

    const conv = await author.data.conversations.open(reader.handle);
    await author.data.conversations.send(conv.conversationId, { sharedPostId: postId });

    const before = await reader.data.conversations.messages(conv.conversationId);
    expect(before.items.at(-1)!.sharedPost).toBeTruthy();

    // The author restricts it. The MESSAGE stays; the POST stops resolving.
    // Conversation access and post visibility are two decisions, not one.
    await author.data.posts.update(postId, { visibility: 'private' });

    const after = await reader.data.conversations.messages(conv.conversationId);
    const last = after.items.at(-1)!;
    expect(last.messageId).toBe(before.items.at(-1)!.messageId);
    expect(last.sharedPost ?? null).toBeNull();
    expect(last.sharedPostUnavailableReason).toBe('not-for-you');
  });

  it('FR-007 a message can be reported, and removal withholds the body not the thread', async () => {
    const a = await actor('modA');
    const b = await actor('modB');
    const operator = await actor('modOp', { isOperator: true });
    await b.data.people.follow(a.handle);
    const conv = await a.data.conversations.open(b.handle);
    const message = await send(a, conv.conversationId, 'the reported message');

    await b.data.safety.report({
      subjectType: 'message',
      subjectId: `${conv.conversationId}:${message!.messageId}`,
      reason: 'harassment',
    });

    const queue = await operator.data.safety.reports({ state: 'open', limit: 50 });
    const report = queue.items.find((r) => r.subjectId === `${conv.conversationId}:${message!.messageId}`);
    expect(report).toBeDefined();

    await operator.data.safety.decide(report!.reportId, { state: 'actioned', action: 'remove_content' });

    const after = await b.data.conversations.messages(conv.conversationId);
    const removed = after.items.find((m) => m.messageId === message!.messageId);
    expect(removed).toBeDefined();               // the thread stays readable
    expect(removed!.moderationState).toBe('removed');
    expect(removed!.body ?? null).toBeNull();    // the body does not
  });

  it('FR-010 marking read clears the unread count', async () => {
    const a = await actor('readA');
    const b = await actor('readB');
    await b.data.people.follow(a.handle);
    const conv = await a.data.conversations.open(b.handle);
    await send(a, conv.conversationId, 'one');
    await send(a, conv.conversationId, 'two');

    const page = await b.data.conversations.messages(conv.conversationId);
    await b.data.conversations.markRead(conv.conversationId, page.items.at(-1)!.messageId);

    const inbox = await b.data.conversations.list({ state: 'accepted' });
    expect(inbox.items.find((c) => c.conversationId === conv.conversationId)!.unreadCount).toBe(0);
  });

  /**
   * FR-012 / Constitution I, and the reason this test exists at all.
   *
   * Chat is the feature most likely to quietly become the product. The failure
   * is silent: a conversation starts influencing what you are shown, the
   * interest structure goes vestigial, and every other test still passes. So the
   * requirement is written to be tested NEGATIVELY, twice - once that a
   * conversation changes nothing about a feed that already has content, and once
   * that messaging a stranger does not admit their posts.
   */
  it('FR-012 a conversation changes neither the contents nor the order of a feed', async () => {
    const author = await actor('widenAuthor');
    const viewer = await actor('widenViewer');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    await viewer.data.interests.follow(interest.interestId);
    await publishReadyImage(author, [interest.interestId]);
    await publishReadyImage(author, [interest.interestId]);

    const before = await viewer.data.feed.home({ limit: 20 });
    expect(before.items.length).toBeGreaterThan(0);

    const conv = await viewer.data.conversations.open(author.handle);
    await viewer.data.conversations.send(conv.conversationId, { body: 'nice photo' });
    await author.data.conversations.send(conv.conversationId, { body: 'thanks' });
    await viewer.data.conversations.send(conv.conversationId, { body: 'where was it' });

    const after = await viewer.data.feed.home({ limit: 20 });
    // Identical ids AND identical order. Ranking may not read message activity
    // any more than membership may.
    expect(after.items.map((p) => p.postId)).toEqual(before.items.map((p) => p.postId));
  });

  it('FR-012 messaging a stranger does not admit their posts to your feed', async () => {
    const stranger = await actor('widenStranger');
    const viewer = await actor('widenViewer2');

    const [mine, theirs] = (await viewer.data.interests.listTop({ limit: 2 })).items;
    await viewer.data.interests.follow(mine!.interestId);
    // Published to an interest the viewer does NOT follow.
    const hidden = await publishReadyImage(stranger, [theirs!.interestId]);

    const conv = await viewer.data.conversations.open(stranger.handle);
    await viewer.data.conversations.send(conv.conversationId, { body: 'hello' });

    // `consistently`, because "it is not there" checked once against an
    // asynchronous pipeline passes before anything could have arrived.
    await consistently(
      () => viewer.data.feed.home({ limit: 50 }),
      (page) => !page.items.some((p) => p.postId === hidden),
      { forMs: 1000, describe: "a messaged stranger's post staying out of the feed" },
    );
  });

  /**
   * T133. THE REQUEST COUNT, not only the latency.
   *
   * If the handler failed to await the event bus and just returned an empty
   * page, the client would re-issue immediately and SC-001's latency assertion
   * would still pass at small scale - it would be fixed-interval polling with no
   * interval. The load characteristic would be silently wrong, which is the
   * whole reason long-poll was chosen over polling (research R1), and against a
   * datastore measured at 882 req/s it is the entire margin.
   *
   * So this counts requests rather than timing one: over a quiet conversation, a
   * correct long poll BLOCKS, and three seconds of waiting costs one request.
   */
  it('FR-011 a long poll over a quiet conversation is ONE request, not a spin', async () => {
    const a = await actor('spinA');
    const b = await actor('spinB');
    await b.data.people.follow(a.handle);
    const conv = await a.data.conversations.open(b.handle);

    const started = Date.now();
    const deadline = started + 2500;
    let requests = 0;
    // A correct handler blocks for the full `waitSeconds`, so the first request
    // outlives the deadline and the loop runs once. A spinning one returns
    // immediately and racks up hundreds.
    while (Date.now() < deadline && requests < 50) {
      requests++;
      await b.data.conversations.messages(conv.conversationId, { waitSeconds: 3 });
    }

    expect(requests).toBe(1);
    // And it blocked rather than failing fast - an error path would also be one
    // request, and would also be wrong.
    expect(Date.now() - started).toBeGreaterThan(2500);
  }, 60_000);
});

