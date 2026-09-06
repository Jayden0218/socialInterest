import { Injectable } from '@nestjs/common';
import { BaseRepository } from './base.repository';
import { keys } from './keys';
import type { DomainEvent } from '../ports';

export interface PendingEventItem {
  eventId: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

/**
 * Events that have been published but not yet handled.
 *
 * The in-process bus delivered on the next tick and kept no record, so an event
 * published before the process died was lost silently. That is not a
 * theoretical failure: in feature 002 nothing subscribed to `post.created`, and
 * the effect was that a post never left `pending` and was visible ONLY to its
 * author - nobody could see anyone else's post. An event dropped by a crash
 * produces exactly that state, for that post, permanently.
 *
 * A record is written BEFORE handlers run and removed only once they have all
 * completed. So the store holds precisely the outstanding work, and a restart
 * can finish it.
 */
@Injectable()
export class EventRepository extends BaseRepository {
  async put(eventId: string, event: DomainEvent): Promise<void> {
    await this.putItem({
      ...keys.pendingEvent(eventId),
      type: 'PendingEvent',
      eventId,
      eventType: event.type,
      payload: event.payload,
      occurredAt: event.occurredAt,
    });
  }

  /** Removed only after every handler has run. Failure leaves it outstanding. */
  async remove(eventId: string): Promise<void> {
    await this.deleteItem(keys.pendingEvent(eventId));
  }

  async listPending(): Promise<PendingEventItem[]> {
    const page = await this.query<{
      eventId: string;
      eventType: string;
      payload: Record<string, unknown>;
      occurredAt: string;
    }>('EVENTS#PENDING', { limit: 200 });
    return page.items.map((i) => ({
      eventId: i.eventId,
      type: i.eventType,
      payload: i.payload,
      occurredAt: i.occurredAt,
    }));
  }
}
