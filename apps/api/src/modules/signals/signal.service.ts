import { Inject, Injectable } from '@nestjs/common';
import { SignalRepository } from '../../persistence/signal.repository';
import { PostQueryService } from '../posts/post-query.service';
import {
  SIGNAL_BATCH_MAX,
  SIGNAL_MAX_DWELL_MS,
  SIGNAL_MIN_DWELL_MS,
  SIGNAL_WEIGHTS,
  type SignalKind,
} from '../ranking/constants';

export interface IncomingSignal {
  kind: SignalKind;
  postId: string;
  dwellMs?: number;
}

const EVENT_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * RECORDS WHAT HAPPENED. Every bound enforced HERE, not on the client.
 *
 * contracts/signals.md: the client reports, the server decides what it is
 * worth. A modified client can send any duration it likes, name any post, or
 * repeat one signal a thousand times - so the clamp, the floor, the visibility
 * check and the per-session cap all live on this side of the wire.
 *
 * Constitution III: a guarantee is enforced where the client cannot bypass it,
 * and it is TESTED through the path a hostile client would take
 * (`signals-hostile-client.spec.ts`), not the well-behaved one.
 */
@Injectable()
export class SignalService {
  /** Per kind, per post, per session — so a scroll back and forth counts once. */
  private readonly sessionSeen = new Map<string, Set<string>>();

  constructor(
    @Inject(SignalRepository) private readonly signals: SignalRepository,
    @Inject(PostQueryService) private readonly posts: PostQueryService,
  ) {}

  async record(
    viewer: { userId: string },
    batch: IncomingSignal[],
  ): Promise<{ accepted: number; rejected: number }> {
    // Bounded, and the EXCESS IS REJECTED rather than silently truncated -
    // truncation would make a client's over-sending look like success.
    if (batch.length > SIGNAL_BATCH_MAX) {
      return { accepted: 0, rejected: batch.length };
    }

    let accepted = 0;
    let rejected = 0;
    const at = new Date().toISOString();

    for (const signal of batch) {
      const weight = this.weightOf(signal);
      if (weight === null) {
        rejected++;
        continue;
      }

      /**
       * A signal for a post this viewer cannot see is REJECTED.
       *
       * Not merely unweighted: writing the event would record that this person
       * looked at that post, which is a fact about a post they are not
       * permitted to know exists. `getById` runs the visibility boundary and
       * returns a Decision when it refuses, so a hidden post is unambiguous.
       */
      const found = await this.posts.getById(viewer, signal.postId).catch(() => null);
      if (!found || 'visible' in found) {
        rejected++;
        continue;
      }

      const interestId = found.post.interestIds?.[0] ?? null;
      if (!interestId) {
        rejected++;
        continue;
      }

      const key = `${viewer.userId}:${signal.kind}:${signal.postId}`;
      const seen = this.sessionSeen.get(viewer.userId) ?? new Set<string>();
      if (seen.has(key)) {
        rejected++;
        continue;
      }
      seen.add(key);
      this.sessionSeen.set(viewer.userId, seen);

      await this.signals.addWeight(viewer.userId, interestId, weight, at);
      await this.signals.recordEvent(
        viewer.userId,
        {
          kind: signal.kind,
          postId: signal.postId,
          interestId,
          ...(signal.dwellMs !== undefined
            ? { dwellMs: Math.min(signal.dwellMs, SIGNAL_MAX_DWELL_MS) }
            : {}),
          at,
        },
        EVENT_TTL_SECONDS,
      );
      accepted++;
    }

    return { accepted, rejected };
  }

  /** Clearing a session's de-duplication, e.g. on sign-out. */
  forget(userId: string): void {
    this.sessionSeen.delete(userId);
  }

  /**
   * What one signal is worth. `null` means "do not record this at all".
   *
   * A dwell below the floor is DISCARDED rather than weighted at zero: a
   * zero-weight event still records that the person saw the post, which is
   * data collected for no ranking benefit.
   */
  private weightOf(signal: IncomingSignal): number | null {
    if (signal.kind !== 'dwell') {
      return SIGNAL_WEIGHTS[signal.kind] ?? null;
    }
    const ms = signal.dwellMs ?? 0;
    if (!Number.isFinite(ms) || ms < SIGNAL_MIN_DWELL_MS) return null;
    // Clamped, because an uncapped dwell measures a phone left on a table -
    // and because a hostile client will send a very large number.
    return (Math.min(ms, SIGNAL_MAX_DWELL_MS) / SIGNAL_MAX_DWELL_MS) * SIGNAL_WEIGHTS.dwell;
  }

}
