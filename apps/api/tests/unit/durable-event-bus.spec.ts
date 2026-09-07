import { DurableEventBus } from '../../src/adapters/local/durable-event-bus';
import type { EventRepository, PendingEventItem } from '../../src/persistence/event.repository';

/**
 * The bus's DURABILITY behaviour, as distinct from its delivery behaviour.
 *
 * `tests/contract/ports.contract.spec.ts` covers the port: fan-out, error
 * containment, the occurredAt stamp. It uses a store that records nothing,
 * because those cases are not about the store.
 *
 * These cases are entirely about the store, and about the ORDER of the three
 * steps — record, deliver, remove. Get that order wrong and the bus still
 * passes every port test while losing an event on any crash, which is the
 * failure feature 002 shipped: nothing subscribed to `post.created`, so a post
 * never left `pending`, and a pending post is visible only to its author.
 *
 * A fake store is the right tool here and an end-to-end run is not: the
 * question is what the bus does with the record, and only a fake can observe
 * the interleaving. Durability across a real restart is proved separately, in
 * apps/e2e/durability.
 */

/** Records the calls AND the order they interleave with handler execution. */
function fakeStore() {
  const log: string[] = [];
  const items = new Map<string, PendingEventItem>();
  const store = {
    put: async (eventId: string, event: { type: string; payload: Record<string, unknown>; occurredAt: string }) => {
      log.push(`put:${event.type}`);
      items.set(eventId, { eventId, type: event.type, payload: event.payload, occurredAt: event.occurredAt });
    },
    remove: async (eventId: string) => {
      log.push(`remove:${items.get(eventId)?.type ?? eventId}`);
      items.delete(eventId);
    },
    listPending: async () => [...items.values()],
  };
  return { store: store as unknown as EventRepository, log, items };
}

/** Delivery is deliberately asynchronous, so the assertions must let it run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('DurableEventBus — the record is what survives a crash', () => {
  it('records the event BEFORE any handler runs', async () => {
    const { store, log } = fakeStore();
    const bus = new DurableEventBus(store);
    bus.subscribe('post.created', () => { log.push('handler'); });

    await bus.publish({ type: 'post.created', payload: {} });
    await settle();

    // If `handler` came first, a crash mid-handler would lose the event: the
    // work would be half-done with nothing left saying it was owed.
    expect(log).toEqual(['put:post.created', 'handler', 'remove:post.created']);
  });

  it('clears the record only once every handler has succeeded', async () => {
    const { store, log, items } = fakeStore();
    const bus = new DurableEventBus(store);
    bus.subscribe('post.created', () => { log.push('ok'); });
    bus.subscribe('post.created', () => { throw new Error('boom'); });

    await bus.publish({ type: 'post.created', payload: {} });
    await settle();

    expect(log).not.toContain('remove:post.created');
    // Still outstanding, so a restart retries it rather than discarding it.
    expect(items.size).toBe(1);
  });

  it('replays an event a previous run left unhandled', async () => {
    const { store, items } = fakeStore();
    items.set('01ABC', {
      eventId: '01ABC', type: 'post.created',
      payload: { postId: 'p1' }, occurredAt: '2026-09-06T00:00:00.000Z',
    });

    const bus = new DurableEventBus(store);
    const seen: Record<string, unknown>[] = [];
    bus.subscribe('post.created', (e) => { seen.push(e.payload); });

    await bus.onApplicationBootstrap();

    expect(seen).toEqual([{ postId: 'p1' }]);
    // Handled on replay, so it is no longer outstanding.
    expect(items.size).toBe(0);
  });

  it('does NOT replay an event that was already handled (T029)', async () => {
    const { store, items } = fakeStore();
    const bus = new DurableEventBus(store);
    let deliveries = 0;
    bus.subscribe('post.commented', () => { deliveries += 1; });

    await bus.publish({ type: 'post.commented', payload: { commentId: 'c1' } });
    await settle();
    expect(deliveries).toBe(1);
    expect(items.size).toBe(0);

    // A restart, against the same store. The event completed, so its record is
    // gone and there is nothing to replay. A bus that removed the record only
    // on a timer, or not at all, would deliver here - and a second delivery of
    // `post.commented` sends the author a duplicate notification.
    await bus.onApplicationBootstrap();
    await settle();

    expect(deliveries).toBe(1);
  });

  it('keeps a replayed event outstanding when its handler fails again', async () => {
    const { store, items } = fakeStore();
    items.set('01DEF', {
      eventId: '01DEF', type: 'post.created', payload: {}, occurredAt: '2026-09-06T00:00:00.000Z',
    });
    const bus = new DurableEventBus(store);
    bus.subscribe('post.created', () => { throw new Error('still broken'); });

    await bus.onApplicationBootstrap();

    expect(items.size).toBe(1);
  });

  it('delivers anyway when the record cannot be written, rather than dropping it', async () => {
    const store = {
      put: async () => { throw new Error('datastore down'); },
      remove: async () => undefined,
      listPending: async () => [],
    } as unknown as EventRepository;
    const bus = new DurableEventBus(store);
    let delivered = 0;
    bus.subscribe('post.created', () => { delivered += 1; });

    await expect(bus.publish({ type: 'post.created', payload: {} })).resolves.toBeUndefined();
    await settle();

    // Best-effort beats nothing: the write that produced the event has already
    // committed, so refusing to deliver would guarantee the loss it is meant
    // to prevent.
    expect(delivered).toBe(1);
  });

  it('boots when the datastore cannot be read at startup', async () => {
    const store = {
      put: async () => undefined,
      remove: async () => undefined,
      listPending: async () => { throw new Error('not ready'); },
    } as unknown as EventRepository;
    const bus = new DurableEventBus(store);

    // A datastore that is slow to accept connections must not stop the service
    // starting; the replay is retried on the next start.
    await expect(bus.onApplicationBootstrap()).resolves.toBeUndefined();
  });
  /**
   * The replay hook, guarded by name.
   *
   * This is the bug T033 caught. Nest runs `onModuleInit` bottom-up through the
   * module graph; the bus's module is imported by every subscriber's module, so
   * it initialised FIRST and replayed into an empty handler map. Zero handlers
   * counts as complete, so the record was removed and the event discarded - by
   * the mechanism written to stop events being discarded.
   *
   * `onApplicationBootstrap` is the hook Nest guarantees runs after every
   * module's onModuleInit. Moving it back would be silent: the unit tests here
   * call the hook directly, so they would all still pass.
   */
  it('replays from onApplicationBootstrap, never from onModuleInit', () => {
    const { store } = fakeStore();
    const bus = new DurableEventBus(store) as unknown as Record<string, unknown>;
    expect(typeof bus['onApplicationBootstrap']).toBe('function');
    expect(bus['onModuleInit']).toBeUndefined();
  });
});
