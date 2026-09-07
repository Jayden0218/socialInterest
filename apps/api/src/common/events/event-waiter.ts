import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { EVENT_BUS, type DomainEvent, type EventBus } from '../../ports';

/**
 * Lets a request wait for an event instead of polling for it.
 *
 * This is what makes long-poll chat delivery sub-second with ONE in-flight
 * request per open conversation, rather than one request per second per
 * conversation. Against a datastore measured at 882 req/s that difference is
 * the whole margin (research R1).
 *
 * NOT a method on the EventBus port. The port is publish/subscribe, and the port
 * is what a second implementation would have to satisfy; growing it with a
 * feature-shaped method makes that harder for no gain. This subscribes like any
 * other consumer.
 *
 * THE LOST-WAKEUP RULE, which callers must follow:
 *
 *     const wait = waiter.wait('message.created', pred, 25_000);  // 1. arm FIRST
 *     const fresh = await repo.listSince(cursor);                 // 2. then check
 *     if (fresh.length) { wait.cancel(); return fresh; }          // 3. maybe skip
 *     await wait.promise;                                         // 4. else sleep
 *
 * Checking before arming loses any event published in between, and the symptom
 * is a message that arrives 25 seconds late exactly when two people are typing
 * at once - which is to say, only under the conditions nobody tests.
 */
@Injectable()
export class EventWaiter implements OnApplicationBootstrap {
  private readonly waiters = new Map<string, Set<(event: DomainEvent) => void>>();
  /** Every armed wait's settle function, so shutdown can release all of them. */
  private readonly armed = new Set<(event: DomainEvent | null) => void>();

  /**
   * Types subscribed at bootstrap rather than on first use.
   *
   * A lazily-subscribed type has no handler during the durable bus's startup
   * replay, which would log "replayed X has no subscriber" - a warning that
   * exists to catch a real ordering bug and must not be trained to mean nothing.
   */
  private static readonly TYPES = ['message.created'] as const;

  constructor(@Inject(EVENT_BUS) private readonly bus: EventBus) {}

  onApplicationBootstrap(): void {
    for (const type of EventWaiter.TYPES) {
      this.bus.subscribe(type, (event) => {
        for (const notify of this.waiters.get(type) ?? []) notify(event);
      });
    }
  }

  /**
   * Resolves with the first matching event, or null when the timeout elapses.
   *
   * A timeout is a NORMAL outcome, not an error: an empty page with a 200 is
   * what a quiet conversation looks like.
   */
  wait(
    type: string,
    matches: (event: DomainEvent) => boolean,
    timeoutMs: number,
  ): { promise: Promise<DomainEvent | null>; cancel: () => void } {
    let settle: ((event: DomainEvent | null) => void) | undefined;
    let timer: NodeJS.Timeout | undefined;

    const listener = (event: DomainEvent): void => {
      if (matches(event)) settle?.(event);
    };

    const set = this.waiters.get(type) ?? new Set();
    set.add(listener);
    this.waiters.set(type, set);

    const promise = new Promise<DomainEvent | null>((resolve) => {
      const finish = (event: DomainEvent | null): void => {
        set.delete(listener);
        if (settle) this.armed.delete(settle);
        if (timer) clearTimeout(timer);
        settle = undefined;
        resolve(event);
      };
      settle = finish;
      this.armed.add(finish);
      timer = setTimeout(() => settle?.(null), timeoutMs);
      // Do not keep the process alive for a poll nobody is waiting on. Without
      // this the API refuses to shut down for up to the wait duration, which in
      // a test run reads as a hung suite.
      timer.unref?.();
    });

    return { promise, cancel: () => settle?.(null) };
  }

  /**
   * Release every armed wait, resolving each with null.
   *
   * For shutdown and for tests. Resolving with null rather than leaving them
   * pending matters: a pending promise at teardown is a hung suite, and a hung
   * suite is indistinguishable from a wedged container - which cost an hour of
   * a CI run on this project once already.
   */
  releaseAll(): void {
    for (const settle of [...this.armed]) settle(null);
    this.armed.clear();
    this.waiters.clear();
  }
}
