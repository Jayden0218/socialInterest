import type { DataClient } from './client';

/** The four kinds, and only four (007 research R2, contracts/signals.md). */
export type SignalKind = 'open' | 'dwell' | 'like' | 'save';

export interface Signal {
  kind: SignalKind;
  postId: string;
  /** Only meaningful with `dwell`. Clamped and floored SERVER-side. */
  dwellMs?: number;
}

export interface SignalReceipt {
  accepted: number;
  rejected: number;
}

export interface FeedSignalDisclosure {
  interests: { interestId: string; name: string; weight: number }[];
  seedInterests: string[];
  collected: string[];
}

/**
 * WHAT THE PERSON DID, reported to the server (007/FR-003, FR-004).
 *
 * This layer REPORTS. It does not decide what a report is worth, and it
 * deliberately applies no bound of its own beyond batching: the clamp, the
 * floor, the visibility check, the per-session cap and the batch limit are all
 * server-side, because a modified client can skip anything written here
 * (Principle III). Duplicating them would only make the client's copy the one
 * people read and trust.
 *
 * Failures are SWALLOWED. A signal is not something a person acts on, so a lost
 * one must never surface as an error or block a scroll — the feed keeps working
 * and ranks slightly less well, which is the correct trade.
 */
export class SignalsData {
  constructor(private readonly client: DataClient) {}

  async record(signals: Signal[]): Promise<SignalReceipt | null> {
    if (signals.length === 0) return { accepted: 0, rejected: 0 };
    try {
      return await this.client.call<SignalReceipt>('postSignals', { body: { signals } });
    } catch {
      return null;
    }
  }

  /** FR-011. What the feed is built from, for the Settings disclosure. */
  disclosure(): Promise<FeedSignalDisclosure> {
    return this.client.call<FeedSignalDisclosure>('getMeFeedSignals');
  }

  /** FR-012. Clears the profile AND the raw events, server-side. */
  clear(): Promise<{ cleared: boolean }> {
    return this.client.call<{ cleared: boolean }>('deleteMeFeedSignals');
  }

  /** FR-014. The cold-start picks. A seed, not a subscription. */
  chooseSeedInterests(interestIds: string[]): Promise<{ seedInterests: string[] }> {
    return this.client.call<{ seedInterests: string[] }>('postMeSeedInterests', {
      body: { interestIds },
    });
  }
}
