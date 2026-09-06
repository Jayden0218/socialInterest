import { Inject, Injectable } from '@nestjs/common';
import { EventWaiter } from '../../common/events/event-waiter';
import { MessageRepository, type MessageItem } from '../../persistence/message.repository';

/** The server will not hold a request longer than this, whatever the client asks. */
export const MAX_WAIT_SECONDS = 25;

/**
 * The long poll (research R1, FR-011).
 *
 * Sub-second delivery with ONE in-flight request per open conversation, rather
 * than one request per second per conversation. Against a datastore measured at
 * 882 req/s (003/R1) that difference is the entire margin, and it is why
 * fixed-interval polling was rejected: it is worse on latency AND on load, which
 * are the two things you would otherwise trade between.
 *
 * Registered as a Constitution V divergence: a hosted deployment will not serve
 * chat by holding HTTP connections, so a green local suite here is NOT evidence
 * that a hosted transport works.
 */
@Injectable()
export class MessagePollService {
  constructor(
    @Inject(MessageRepository) private readonly messages: MessageRepository,
    @Inject(EventWaiter) private readonly waiter: EventWaiter,
  ) {}

  async read(
    conversationId: string,
    opts: { after?: string | null; limit?: number; waitSeconds?: number },
  ): Promise<{ items: MessageItem[]; nextCursor: string | null }> {
    const waitSeconds = Math.min(Math.max(opts.waitSeconds ?? 0, 0), MAX_WAIT_SECONDS);

    /**
     * ARM FIRST, THEN CHECK. Reversing these loses any message published in
     * between, and the symptom is a message arriving 25 seconds late exactly
     * when two people are typing at once - the condition nobody tests.
     */
    const wait =
      waitSeconds > 0
        ? this.waiter.wait(
            'message.created',
            (e) => e.payload.conversationId === conversationId,
            waitSeconds * 1000,
          )
        : null;

    const first = await this.messages.list(conversationId, {
      ...(opts.after ? { after: opts.after } : {}),
      ...(opts.limit ? { limit: opts.limit } : {}),
    });
    if (first.items.length > 0 || !wait) {
      wait?.cancel();
      return first;
    }

    // An empty page after the wait elapses is a NORMAL quiet conversation, not
    // an error. The client re-issues.
    const woken = await wait.promise;
    if (!woken) return { items: [], nextCursor: null };

    return this.messages.list(conversationId, {
      ...(opts.after ? { after: opts.after } : {}),
      ...(opts.limit ? { limit: opts.limit } : {}),
    });
  }
}
