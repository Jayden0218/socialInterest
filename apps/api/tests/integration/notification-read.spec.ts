import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { NotificationRepository } from '../../src/persistence/notification.repository';

/**
 * 008/T024, T025, T030 — US2. `readAt` FINALLY HAS A WRITER.
 *
 * The field has been declared on every notification, returned to every client,
 * and written by NOTHING since 001. Every notification in this product has been
 * unread forever, and no test noticed because every test asserted the field was
 * PRESENT and none asserted it was ever populated.
 *
 * The watermark shape is the one this codebase already uses for messages
 * (`ConversationRepository.markRead`), so what is tested here is the behaviour
 * that shape has to produce, not the shape itself.
 */
describe('008/US2 notifications can be read', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

  /**
   * Notifications written through the repository rather than produced by
   * reacting and following.
   *
   * Deliberate: this suite is about the READ STATE, and generating them through
   * the event bus would make every assertion race the pipeline. 004 recorded
   * four tests in this repository that waited for a DURATION rather than a
   * condition and were red in CI and green locally. The generation path has its
   * own coverage in `notification-preferences.spec.ts`.
   */
  const give = async (recipientId: string, actorId: string, howMany: number): Promise<void> => {
    const repo = h.module.get(NotificationRepository);
    for (let i = 0; i < howMany; i++) {
      await repo.create({ recipientId, actorId, kind: 'follow' });
      // Distinct createdAt values: the sort key is `NOTIF#<createdAt>#<id>` and
      // a watermark comparison on identical timestamps would test nothing.
      await new Promise((r) => setTimeout(r, 2));
    }
  };

  it('FR-005 viewing marks them read, durably, and readAt is populated', async () => {
    const person = await h.createPerson('readerA');
    const actor = await h.createPerson('actorA');
    const token = await h.token(person);
    await give(person, actor, 3);

    const before = await request(server()).get('/v1/notifications').set('authorization', `Bearer ${token}`);
    expect(before.status).toBe(200);
    expect(before.body.items).toHaveLength(3);
    // The defect, stated as an assertion: every one of them unread.
    expect(before.body.items.every((n: { readAt: string | null }) => n.readAt === null)).toBe(true);
    expect(before.body.page.unreadCount).toBe(3);

    const marked = await request(server())
      .put('/v1/notifications/read')
      .set('authorization', `Bearer ${token}`);
    expect(marked.status).toBe(204);

    const after = await request(server()).get('/v1/notifications').set('authorization', `Bearer ${token}`);
    expect(after.body.items.every((n: { readAt: string | null }) => typeof n.readAt === 'string')).toBe(true);
    expect(after.body.page.unreadCount).toBe(0);
  }, 60_000);

  it('FR-006 the count is the TRUE number, not the page size', async () => {
    const person = await h.createPerson('readerB');
    const actor = await h.createPerson('actorB');
    const token = await h.token(person);
    await give(person, actor, 5);

    await request(server()).put('/v1/notifications/read').set('authorization', `Bearer ${token}`);
    await give(person, actor, 2);

    // Asked for ONE item, and the count must still be 2. A count derived from
    // the returned page would say 1 here - a badge that changed as you scrolled
    // would be reporting the request rather than the person's notifications.
    const page = await request(server())
      .get('/v1/notifications?limit=1')
      .set('authorization', `Bearer ${token}`);
    expect({ items: page.body.items.length, unread: page.body.page.unreadCount })
      .toEqual({ items: 1, unread: 2 });
  }, 60_000);

  it('FR-005 the mark is durable - a later read still sees it', async () => {
    const person = await h.createPerson('readerC');
    const actor = await h.createPerson('actorC');
    const token = await h.token(person);
    await give(person, actor, 2);
    await request(server()).put('/v1/notifications/read').set('authorization', `Bearer ${token}`);

    // Straight from the store, not the endpoint: "durably" is a claim about what
    // was written, and an endpoint that recomputed it in memory would pass a
    // read-back test while persisting nothing.
    const stored = await h.module.get(NotificationRepository).readWatermark(person);
    expect(typeof stored).toBe('string');
  }, 60_000);

  it('FR-007 marking read affects NOBODY else', async () => {
    const mine = await h.createPerson('readerD');
    const theirs = await h.createPerson('readerE');
    const actor = await h.createPerson('actorD');
    await give(mine, actor, 2);
    await give(theirs, actor, 2);

    await request(server()).put('/v1/notifications/read').set('authorization', `Bearer ${await h.token(mine)}`);

    const other = await request(server())
      .get('/v1/notifications')
      .set('authorization', `Bearer ${await h.token(theirs)}`);
    expect(other.body.page.unreadCount).toBe(2);
    expect(other.body.items.every((n: { readAt: string | null }) => n.readAt === null)).toBe(true);
  }, 60_000);

  it('is idempotent - marking twice is not a second event', async () => {
    const person = await h.createPerson('readerF');
    const actor = await h.createPerson('actorF');
    const token = await h.token(person);
    await give(person, actor, 1);

    const first = await request(server()).put('/v1/notifications/read').set('authorization', `Bearer ${token}`);
    const second = await request(server()).put('/v1/notifications/read').set('authorization', `Bearer ${token}`);
    expect([first.status, second.status]).toEqual([204, 204]);

    const after = await request(server()).get('/v1/notifications').set('authorization', `Bearer ${token}`);
    expect(after.body.page.unreadCount).toBe(0);
  }, 60_000);

  it('refuses an anonymous caller - a watermark belongs to a person', async () => {
    const res = await request(server()).put('/v1/notifications/read');
    expect(res.status).toBe(401);
  }, 60_000);
});
