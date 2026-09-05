import { Logger } from '@nestjs/common';
import type { DomainEvent, EventBus, EventHandler } from '../../ports';

/** In-process stand-in for EventBridge + SQS. Handlers run on the next tick. */
export class InProcessEventBus implements EventBus {
  private readonly logger = new Logger(InProcessEventBus.name);
  private readonly handlers = new Map<string, EventHandler[]>();

  subscribe(type: string, handler: EventHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  async publish(event: Omit<DomainEvent, 'occurredAt'>): Promise<void> {
    const full: DomainEvent = { ...event, occurredAt: new Date().toISOString() };
    for (const handler of this.handlers.get(event.type) ?? []) {
      // Deliver asynchronously so a slow handler never blocks the request path,
      // and a failing one never fails the write that produced the event.
      //
      // The handler call is INSIDE the async wrapper deliberately. Writing
      // `Promise.resolve(handler(full)).catch(...)` looks equivalent but is not:
      // a handler that throws synchronously does so while evaluating the
      // argument, before any promise exists to catch it, and the throw escapes
      // as an unhandled exception. Awaiting inside the wrapper turns both
      // synchronous and asynchronous failures into a rejected promise.
      queueMicrotask(() => {
        void (async () => handler(full))().catch((e: unknown) => {
          this.logger.error(`handler for ${event.type} failed: ${String(e)}`);
        });
      });
    }
  }
}
