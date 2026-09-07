import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
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
 * A crash before 3 leaves the record, and the replay at startup finishes it. A
 * handler that throws also leaves it, so the work is retried rather than lost.
 *
 * Delivery is still asynchronous, so a slow handler never blocks the request
 * that produced the event, and a failing one never fails the write.
 */
@Injectable()
export class DurableEventBus implements EventBus, OnApplicationBootstrap {
  private readonly logger = new Logger(DurableEventBus.name);
  private readonly handlers = new Map<string, EventHandler[]>();

  constructor(@Inject(EventRepository) private readonly events: EventRepository) {}

  /**
   * Finish what a previous process started.
   *
   * `onApplicationBootstrap`, NOT `onModuleInit`. Nest runs onModuleInit
   * bottom-up through the module graph, and the bus lives in a module that
   * every subscriber's module imports - so it initialised FIRST, replayed into
   * an empty handler map, found nothing outstanding to run, and cleared the
   * record as complete. The event was silently discarded by the very mechanism
   * written to stop events being silently discarded.
   *
   * That is not a hypothetical: it is what the T033 durability case caught. A
   * post killed mid-pipeline came back `pending` forever after the restart -
   * the identical symptom to feature 002, where nothing subscribed to
   * `post.created` and a pending post is visible only to its author.
   *
   * onApplicationBootstrap is the hook Nest guarantees runs after EVERY
   * module's onModuleInit has resolved, which is exactly the guarantee the
   * replay needs.
   */
  async onApplicationBootstrap(): Promise<void> {
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
      // A recorded event with nothing to handle it is worth saying out loud.
      // In steady state it is fine - `post.deleted` has no subscriber and
      // nothing is owed - but on a REPLAY it is the signature of the ordering
      // bug above, and the whole cost of that bug was that it said nothing.
      if ((this.handlers.get(p.type) ?? []).length === 0) {
        this.logger.warn(
          `replayed ${p.type} has no subscriber; clearing it. If something should ` +
            'have handled this, it was not registered when the replay ran.',
        );
      }
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
