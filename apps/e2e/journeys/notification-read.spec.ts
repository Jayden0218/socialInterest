import { actor } from '../support/client';
import { eventually } from '../support/eventually';
import { publishReadyImage } from '../support/publish';

/**
 * 008/T024 — SC-003, over real HTTP, through the APP'S OWN DATA LAYER.
 *
 * The integration suite covers the same behaviour against the service. This one
 * exists because that is not the same claim: every mobile test stubs
 * `apps/mobile/src/data`, and 007 found five features' worth of lists that could
 * never load a second page because `ApiPage<T>` declared `nextCursor` at the top
 * level while every endpoint nested it under `page`. The stubs were wrong in
 * exactly the way the type was, so they agreed with each other and neither
 * agreed with the server.
 *
 * `unreadCount` is a new field in that same `page` object. Asserting it from a
 * REAL response is the only thing that would catch it being read from the wrong
 * level again.
 */
describe('008/SC-003 after viewing, zero notifications remain unread', () => {
  it('marks read through the app data layer, and the count is the true number', async () => {
    const author = await actor('notifReadAuthor');
    const fan = await actor('notifReadFan');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'read me' });

    await fan.data.engagement.react(postId);
    await fan.data.people.follow(author.handle);

    // WAITED FOR, not slept on: notifications arrive through the event bus, and
    // 004 recorded four tests here that waited for a duration instead of a
    // condition and were red in CI and green locally.
    const before = await eventually(
      () => author.data.notifications.list({ limit: 20 }),
      (p) => p.items.some((n) => n.kind === 'reaction') && p.items.some((n) => n.kind === 'follow'),
      { timeoutMs: 15_000, describe: 'a reaction and a follow notification' },
    );

    // The defect this story fixes, as an assertion on a real response.
    expect(before.items.every((n) => n.readAt === null || n.readAt === undefined)).toBe(true);
    expect(before.page.unreadCount).toBe(before.items.length);

    await author.data.notifications.markAllRead();

    const after = await author.data.notifications.list({ limit: 20 });
    expect({
      unread: after.page.unreadCount,
      allRead: after.items.every((n) => typeof n.readAt === 'string'),
    }).toEqual({ unread: 0, allRead: true });
  }, 120_000);

  it('a notification arriving AFTER the mark is unread again (FR-006)', async () => {
    const author = await actor('notifReadAuthor2');
    const fan = await actor('notifReadFan2');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'again' });

    await fan.data.people.follow(author.handle);
    await eventually(
      () => author.data.notifications.list({ limit: 20 }),
      (p) => p.items.length > 0,
      { timeoutMs: 15_000, describe: 'the first notification' },
    );
    await author.data.notifications.markAllRead();
    expect((await author.data.notifications.list({ limit: 20 })).page.unreadCount).toBe(0);

    // A second, genuinely new one.
    await fan.data.engagement.react(postId);
    const after = await eventually(
      () => author.data.notifications.list({ limit: 20 }),
      (p) => (p.page.unreadCount ?? 0) > 0,
      { timeoutMs: 15_000, describe: 'the count to rise again' },
    );

    // Exactly one, not "some": a watermark that reset rather than advanced would
    // make everything unread again and would also pass a "greater than zero".
    expect(after.page.unreadCount).toBe(1);
    const unread = after.items.filter((n) => !n.readAt);
    expect({ count: unread.length, kind: unread[0]?.kind }).toEqual({ count: 1, kind: 'reaction' });
  }, 120_000);
});
