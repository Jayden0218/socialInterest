import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { keys } from './keys';
import type { StoredWeight } from '../modules/ranking/decay';

export interface SignalProfileItem {
  weights: Record<string, StoredWeight>;
  updatedAt: string;
}

export interface SignalEventItem {
  kind: string;
  postId: string;
  interestId: string;
  dwellMs?: number;
  at: string;
}

/**
 * 007 access patterns B1-B6. Two new item types, no new GSI.
 *
 * A person's signals live entirely inside their own partition and no index
 * reaches them from anywhere else. That is the storage-level half of Principle
 * III's promise: another person cannot read them because there is no query that
 * returns them.
 */
@Injectable()
export class SignalRepository extends BaseRepository {
  /** B1 - one GetItem on the hottest path. */
  async profile(userId: string): Promise<SignalProfileItem | null> {
    return this.getItem<SignalProfileItem>(keys.signalProfile(userId));
  }

  /**
   * B2 - add weight to one interest.
   *
   * Read-modify-write rather than an atomic ADD, because the value is a nested
   * map entry carrying its own timestamp and DynamoDB cannot increment inside a
   * map without the path already existing. Signals for one person arrive from
   * one device at human speed, so the race this loses is a dropped fraction of
   * one weight - not a correctness problem worth a transaction.
   */
  async addWeight(userId: string, interestId: string, delta: number, at: string): Promise<void> {
    const existing = await this.profile(userId);
    const weights = { ...(existing?.weights ?? {}) };
    const prior = weights[interestId];
    weights[interestId] = { w: (prior?.w ?? 0) + delta, at };
    await this.putItem({
      ...keys.signalProfile(userId),
      type: 'SignalProfile',
      weights,
      updatedAt: at,
    });
  }

  /** B3 - the raw event, expired by TTL rather than by a job. */
  async recordEvent(userId: string, event: SignalEventItem, ttlSeconds: number): Promise<void> {
    await this.putItem({
      ...keys.signalEvent(userId, event.at, event.postId),
      type: 'SignalEvent',
      ...event,
      ttl: Math.floor(Date.now() / 1000) + ttlSeconds,
    });
  }

  /** B4 - a person's events, for deletion and for diagnosing a folding bug. */
  async listEvents(userId: string, opts: { limit?: number; cursor?: string | null } = {}): Promise<Page<SignalEventItem>> {
    return this.query<SignalEventItem>(`USER#${userId}`, {
      skPrefix: 'SIGNAL#',
      limit: opts.limit ?? 100,
      cursor: opts.cursor ?? null,
    });
  }

  /**
   * B5 - FR-012. Deletes the profile AND every event.
   *
   * Both, because clearing only the total would leave the events behind and
   * make the promise false in a way nobody would notice until they looked.
   */
  async clear(userId: string): Promise<void> {
    await this.deleteItem(keys.signalProfile(userId));
    let cursor: string | null = null;
    do {
      const page: Page<SignalEventItem> = await this.listEvents(userId, { limit: 100, cursor });
      for (const e of page.items) {
        await this.deleteItem(keys.signalEvent(userId, e.at, e.postId));
      }
      cursor = page.nextCursor;
    } while (cursor);
  }

  /** B6 - the cold-start picks. Not follows; see keys.seedInterests. */
  async seeds(userId: string): Promise<string[]> {
    const item = await this.getItem<{ interestIds: string[] }>(keys.seedInterests(userId));
    return item?.interestIds ?? [];
  }

  async setSeeds(userId: string, interestIds: string[]): Promise<void> {
    await this.putItem({
      ...keys.seedInterests(userId),
      type: 'SeedInterests',
      interestIds,
      chosenAt: new Date().toISOString(),
    });
  }
}
