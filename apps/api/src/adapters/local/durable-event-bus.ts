import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ulid } from 'ulid';
import { EventRepository } from '../../persistence/event.repository';
import type { DomainEvent, EventBus, EventHandler } from '../../ports';

/**
 * An event bus that outlives the process that published on it.
 *
 * The in-process bus delivered on the next tick and kept no record. If the
 * process died between publishing and handling - a crash, a restart, a
 * container reclaimed - the event was gone with no trace that it had ever
 * existed. Feature 002 showed what that costs: with nothing subscribed to
 * `post.created`, a post never left `pending`, and a pending post is visible
 * only to its author. Nobody could see anyone else's post.
 *
 * The order here is the whole design:
 *
 *   1. record the event          <- survives a crash from this point on
 *   2. run every handler
 *   3. remove the record         <- only once they have all succeeded
 *
 * A crash before 3 leaves the record, and `onModuleInit` replays it. A handler
 * that throws also leaves it, so the work is retried rather than lost.
 *
 * Delivery is still asynchronous, so a slow handler never blocks the request
 * that produced the event, and a failing one never fails the write.
 */
@Injectable()
export class DurableEventBus implements EventBus, OnModuleInit {
  private readonly logger = new Logger(DurableEventBus.name);
  private readonly handlers = new Map<string, EventHandler[]>();

  constructor(@Inject(EventRepository) private readonly events: EventRepository) {}

  /**
   * Finish what a previous process started.
   *
   * Runs after every module has initialised, so handlers are registered by the
   * time anything is replayed. Failures are logged and the record left in
   * place: a replay that cannot complete must not silently discard the work.
   */
  async onModuleInit(): Promise<void> {
    let pending: Awaited<ReturnType<EventRepository['listPending']>>;
    try {
      pending = await this.events.listPending();
    } catch (e: unknown) {
      // A datastore that is not ready yet must not stop the service booting.
      this.logger.warn(`could not read pending events at startup: ${String(e)}`);
      return;
    }
    if (pending.length === 0) return;
    this.logger.log(`replaying ${pending.length} event(s) left unhandled by a previous run`);
    for (const p of pending) {
      await this.deliver(p.eventId, {
        type: p.type,
        payload: p.payload,
        occurredAt: p.occurredAt,
      });
    }
  }

  subscribe(type: string, handler: EventHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  async publish(event: Omit<DomainEvent, 'occurredAt'>): Promise<void> {
    const full: DomainEvent = { ...event, occurredAt: new Date().toISOString() };
    const eventId = ulid();

    // Recorded BEFORE delivery. This await is the durability guarantee: from
    // here on, a crash cannot lose the event.
    try {
      await this.events.put(eventId, full);
    } catch (e: unknown) {
      // If it cannot be recorded, deliver it anyway rather than dropping it.
      // Best-effort beats nothing, and the failure is visible in the log.
      this.logger.error(`could not record ${event.type}, delivering without a record: ${String(e)}`);
      void this.deliver(null, full);
      return;
    }

    void this.deliver(eventId, full);
  }

  /**
   * Runs every handler, then removes the record.
   *
   * The handler call is INSIDE the async wrapper deliberately. Writing
   * `Promise.resolve(handler(e)).catch(...)` looks equivalent and is not: a
   * handler that throws synchronously does so while the argument is being
   * evaluated, before any promise exists to catch it, and the throw escapes as
   * an unhandled exception.
   */
  private async deliver(eventId: string | null, event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    let allSucceeded = true;

    for (const handler of handlers) {
      try {
        await (async () => handler(event))();
      } catch (e: unknown) {
        allSucceeded = false;
        this.logger.error(`handler for ${event.type} failed: ${String(e)}`);
      }
    }

    // Removed only when every handler succeeded, so a failure is retried on the
    // next start rather than discarded. An event with no subscribers is
    // complete: there is nothing outstanding to retry.
    if (eventId !== null && allSucceeded) {
      try {
        await this.events.remove(eventId);
      } catch (e: unknown) {
        // Left in place: a replay delivering twice is recoverable, losing the
        // event is not.
        this.logger.warn(`could not clear handled event ${eventId}: ${String(e)}`);
      }
    }
  }
}
