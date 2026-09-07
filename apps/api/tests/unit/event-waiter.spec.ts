import { EventWaiter } from '../../src/common/events/event-waiter';
import type { DomainEvent, EventBus, EventHandler } from '../../src/ports';

/** A bus that records subscriptions, so the ordering rules can be asserted. */
class FakeBus implements EventBus {
  readonly handlers = new Map<string, EventHandler[]>();
  subscribe(type: string, handler: EventHandler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }
  async publish(event: Omit<DomainEvent, 'occurredAt'>): Promise<void> {
    const full = { ...event, occurredAt: new Date().toISOString() };
    for (const h of this.handlers.get(event.type) ?? []) await h(full);
  }
}

const build = (): { bus: FakeBus; waiter: EventWaiter } => {
  const bus = new FakeBus();
  const waiter = new EventWaiter(bus);
  waiter.onApplicationBootstrap();
  return { bus, waiter };
};

const isConv = (id: string) => (e: DomainEvent) => e.payload.conversationId === id;

describe('EventWaiter - what makes long-poll delivery sub-second', () => {
  it('subscribes at bootstrap, not on first wait', () => {
    const { bus } = build();
    // A lazily-subscribed type has no handler during the durable bus's startup
    // replay, which logs "no subscriber" - a warning that exists to catch a real
    // ordering bug and must not be trained to mean nothing.
    expect(bus.handlers.get('message.created')).toHaveLength(1);
  });

  it('resolves with the matching event', async () => {
    const { bus, waiter } = build();
    const wait = waiter.wait('message.created', isConv('c1'), 1000);
    await bus.publish({ type: 'message.created', payload: { conversationId: 'c1', messageId: 'm1' } });
    expect((await wait.promise)?.payload.messageId).toBe('m1');
  });

  it('ignores an event for a different conversation', async () => {
    const { bus, waiter } = build();
    const wait = waiter.wait('message.created', isConv('c1'), 60);
    await bus.publish({ type: 'message.created', payload: { conversationId: 'OTHER' } });
    // Times out rather than waking. Waking on somebody else's message would
    // spin every open conversation on every message in the system.
    expect(await wait.promise).toBeNull();
  });

  it('resolves null on timeout, which is a normal quiet conversation and not an error', async () => {
    const { waiter } = build();
    expect(await waiter.wait('message.created', () => true, 30).promise).toBeNull();
  });

  it('cancel resolves immediately, so a caller that found fresh rows does not sleep', async () => {
    const { waiter } = build();
    const wait = waiter.wait('message.created', () => true, 60_000);
    wait.cancel();
    expect(await wait.promise).toBeNull();
  });

  it('releaseAll settles everything, so teardown cannot hang', async () => {
    const { waiter } = build();
    const a = waiter.wait('message.created', () => true, 60_000);
    const b = waiter.wait('message.created', () => true, 60_000);
    waiter.releaseAll();
    expect(await Promise.all([a.promise, b.promise])).toEqual([null, null]);
  });

  it('stops listening once settled, so one event never resolves a finished wait twice', async () => {
    const { bus, waiter } = build();
    const wait = waiter.wait('message.created', () => true, 1000);
    await bus.publish({ type: 'message.created', payload: { n: 1 } });
    await bus.publish({ type: 'message.created', payload: { n: 2 } });
    expect((await wait.promise)?.payload.n).toBe(1);
  });

  /**
   * THE LOST WAKEUP. Arm first, then check, then sleep.
   *
   * A caller that checks the datastore before arming loses any event published
   * in between, and the symptom is a message arriving 25 seconds late exactly
   * when two people are typing at once - the condition nobody tests.
   */
  it('an event published between arming and checking is not lost', async () => {
    const { bus, waiter } = build();
    const wait = waiter.wait('message.created', isConv('c1'), 1000); // 1. arm
    await bus.publish({ type: 'message.created', payload: { conversationId: 'c1', messageId: 'm9' } });
    const foundInStore: string[] = []; //                                2. check (empty)
    expect(foundInStore).toHaveLength(0); //                             3. so sleep
    expect((await wait.promise)?.payload.messageId).toBe('m9'); //       4. and wake
  });
});
