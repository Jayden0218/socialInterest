import { Injectable } from '@nestjs/common';

export type ConversationState = 'requested' | 'accepted' | 'declined' | 'severed';

/**
 * Everything this boundary needs, and nothing else.
 *
 * Deliberately NOT the persistence row: a boundary that takes a repository item
 * ends up reachable only from the repository, and the notification builder and
 * the moderation queue then write their own check instead. That is precisely
 * how six predicates happen.
 */
export interface ConversationForAccess {
  readonly conversationId: string;
  readonly participantIds: readonly string[];
  readonly initiatorId: string;
  readonly state: ConversationState;
  /** Either participant's account is no longer active. Read-only thread. */
  readonly participantInactive?: boolean;
}

/**
 * Why a viewer was refused - and, in one case, why they were not told.
 *
 * `not-found` is returned for a conversation that does not exist, for one the
 * viewer is not in, AND for one severed by a block. They are deliberately
 * indistinguishable, for the same reason 001's visibility contract makes a
 * blocked post a 404 rather than a 403: a distinguishable refusal discloses the
 * thing it refuses.
 */
export type Refusal = 'not-found' | 'unauthenticated' | 'silently-discarded';

/**
 * THE single conversation-membership boundary.
 *
 * Top level, beside `visibility/`, not inside `modules/conversations/`. 001/D6
 * put VisibilityFilter at the top level for a reason that applies unchanged
 * here: a boundary living inside its consumer becomes a helper, and a helper
 * gets inlined. Every path - the message list, the send handler, the inbox, the
 * notification builder, the moderation queue - calls this.
 *
 * Contract: 004/contracts/visibility-matrix-addendum.md Part 2, enforced by a
 * generated table in tests/unit/conversation-access.spec.ts.
 *
 * NOTE ON SCOPE. This decides access to a CONVERSATION. A post shared inside a
 * message is a POST read and goes through VisibilityFilter, separately and
 * additionally. A reader permitted the message is not thereby permitted the
 * post, and conflating the two is the mistake this note exists to prevent.
 */
@Injectable()
export class ConversationAccess {
  /** May this viewer read the conversation and its messages? */
  canRead(viewerId: string | null, conversation: ConversationForAccess): boolean {
    if (!viewerId) return false;
    if (!this.isParticipant(viewerId, conversation)) return false;
    // A block severs symmetrically. Who blocked whom is not asked, because the
    // answer must not be observable from either side.
    if (conversation.state === 'severed') return false;
    // requested, accepted, declined and a departed participant all stay
    // readable. `requested` withholds the NOTIFICATION (FR-004), not the
    // content: a recipient must be able to see what they are accepting.
    return true;
  }

  /** May this viewer's message be stored in the conversation? */
  canWrite(viewerId: string | null, conversation: ConversationForAccess): boolean {
    if (!this.canRead(viewerId, conversation)) return false;
    // Nothing is stored in a declined conversation. The API still answers 202 -
    // that shaping belongs to the controller, and this boundary's answer is no.
    if (conversation.state === 'declined') return false;
    // A thread with a departed participant is a record, not a channel.
    if (conversation.participantInactive) return false;
    return true;
  }

  /**
   * canWrite, plus the one-unanswered-message rule (FR-005, FR-008).
   *
   * Separate from canWrite because it needs a count, and a boundary that needs a
   * database read for every question is a boundary people route around.
   */
  canSendNow(
    viewerId: string | null,
    conversation: ConversationForAccess,
    counts: { initiatorMessageCount: number },
  ): boolean {
    if (!this.canWrite(viewerId, conversation)) return false;
    if (conversation.state !== 'requested') return true;
    // The recipient is never gated: replying is what accepts.
    if (viewerId !== conversation.initiatorId) return true;
    return counts.initiatorMessageCount < 1;
  }

  /**
   * What to tell a viewer who was refused.
   *
   * `null` means "not refused" - callers should not reach here, and a caller
   * that does gets an honest answer rather than a misleading refusal.
   */
  refusal(viewerId: string | null, conversation: ConversationForAccess | null): Refusal | null {
    if (!conversation) return 'not-found';
    if (!viewerId) return 'unauthenticated';
    if (conversation.state === 'severed') return 'not-found';
    if (!this.isParticipant(viewerId, conversation)) return 'not-found';
    if (conversation.state === 'declined') return 'silently-discarded';
    return null;
  }

  private isParticipant(viewerId: string, conversation: ConversationForAccess): boolean {
    return conversation.participantIds.includes(viewerId);
  }
}
