/**
 * Publish-funnel events (SC-001, SC-004).
 *
 * Added after /speckit-analyze found the gap (G4): both criteria are about the
 * FIRST post - time to publish it, and whether the first attempt succeeds - and
 * neither is answerable from server data alone. The server never sees an
 * abandonment, and it cannot distinguish "took three minutes" from "opened the
 * app three minutes before publishing something prepared earlier".
 */
export type PublishFunnelEvent =
  | { type: 'publish_started'; at: number }
  | { type: 'media_selected'; at: number; count: number; kind: 'image' | 'video' }
  | { type: 'interest_chosen'; at: number; interestId: string }
  | { type: 'visibility_set'; at: number; visibility: string }
  | { type: 'publish_submitted'; at: number }
  | { type: 'publish_succeeded'; at: number; postId: string; attempt: number }
  | { type: 'publish_failed'; at: number; attempt: number; status: number }
  | { type: 'publish_abandoned'; at: number; lastStep: string };

export interface AnalyticsSink {
  record(event: PublishFunnelEvent): void;
}

/**
 * Tracks one publish attempt. `attempt` is carried on the outcome events so
 * SC-004 (90% succeed on the FIRST attempt) can be measured as stated -
 * counting eventual successes would report a healthy number for a flow people
 * had to fight through.
 */
export class PublishFunnel {
  private startedAt: number | null = null;
  private attempt = 0;
  private lastStep = 'publish_started';

  constructor(private readonly sink: AnalyticsSink) {}

  start(now = Date.now()): void {
    this.startedAt = now;
    this.attempt = 0;
    this.emit({ type: 'publish_started', at: now });
  }

  mediaSelected(count: number, kind: 'image' | 'video', now = Date.now()): void {
    this.emit({ type: 'media_selected', at: now, count, kind });
  }

  interestChosen(interestId: string, now = Date.now()): void {
    this.emit({ type: 'interest_chosen', at: now, interestId });
  }

  visibilitySet(visibility: string, now = Date.now()): void {
    this.emit({ type: 'visibility_set', at: now, visibility });
  }

  submitted(now = Date.now()): void {
    this.attempt += 1;
    this.emit({ type: 'publish_submitted', at: now });
  }

  /** Returns the SC-001 duration: composer opened to post published. */
  succeeded(postId: string, now = Date.now()): number | null {
    this.emit({ type: 'publish_succeeded', at: now, postId, attempt: this.attempt });
    return this.startedAt === null ? null : now - this.startedAt;
  }

  failed(status: number, now = Date.now()): void {
    this.emit({ type: 'publish_failed', at: now, attempt: this.attempt, status });
  }

  /** Called when the composer closes without publishing. */
  abandoned(now = Date.now()): void {
    this.emit({ type: 'publish_abandoned', at: now, lastStep: this.lastStep });
  }

  private emit(event: PublishFunnelEvent): void {
    this.lastStep = event.type;
    this.sink.record(event);
  }
}
