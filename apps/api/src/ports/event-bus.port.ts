export interface DomainEvent {
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export type EventHandler = (event: DomainEvent) => Promise<void> | void;

export interface EventBus {
  publish(event: Omit<DomainEvent, 'occurredAt'>): Promise<void>;
  subscribe(type: string, handler: EventHandler): void;
}

export const EVENT_BUS = Symbol('EventBus');
