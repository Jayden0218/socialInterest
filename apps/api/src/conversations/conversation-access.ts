import { Injectable } from '@nestjs/common';

/**
 * 005/FR-021 adds `left`, and it is unlike the other four.
 *
 * The first four describe a CONVERSATION - or, for a pair, equivalently both
 * people's relationship to it. `left` can only ever describe a PARTICIPATION:
 * one person leaving a group of four does not put the conversation in a state.
 * It is therefore only ever seen in `viewerState`, never on the meta item.
 */
export type ConversationState = 'requested' | 'accepted' | 'declined' | 'severed' | 'left';

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
  /**
   * The CONVERSATION's state, for a pair. Still the answer for every
   * conversation written before 005, and for every pair conversation since.
   */
  readonly state: ConversationState;
  /**
   * 005/R2. THIS VIEWER's state, when the conversation has one per participant.
   *
   * Takes precedence when present. A group has no single state - Alice accepted,
   * Bob has not looked, Jo declined - so asking "what state is this conversation
   * in" has no answer, while "what is this person's relationship to it" always
   * does.
   *
   * Optional rather than required so the pair path and every legacy row keep
   * working unchanged (FR-026), and so this boundary stays PURE: it is handed
   * the answer rather than reading a row to find it, which is what lets its
   * decision table be a unit test.
   */
  readonly viewerState?: ConversationState;
  readonly kind?: 'pair' | 'group';
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
    const state = this.stateFor(conversation);
    // A block severs symmetrically. Who blocked whom is not asked, because the
    // answer must not be observable from either side.
    if (state === 'severed') return false;
    /**
     * 005/FR-021. Somebody who left stops receiving the conversation.
     *
     * Their own messages remain readable TO THE REST - that is a property of the
     * message rows, which are untouched - but leaving means leaving. A departed
     * participant who could still read would make "leave" a mute button, which
     * is a different feature nobody asked for.
     */
    if (state === 'left') return false;
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
    if (this.stateFor(conversation) === 'declined') return false;
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
    if (this.stateFor(conversation) !== 'requested') return true;
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
    const state = this.stateFor(conversation);
    if (state === 'severed') return 'not-found';
    if (!this.isParticipant(viewerId, conversation)) return 'not-found';
    // A person who left is told the same thing as somebody who was never in it.
    // Anything else would let a departed participant confirm the group still
    // exists and who is still in it.
    if (state === 'left') return 'not-found';
    if (state === 'declined') return 'silently-discarded';
    return null;
  }

  /**
   * The viewer's state if the conversation carries one, else the conversation's.
   *
   * One accessor rather than `?? ` at six call sites: the precedence rule is a
   * decision, and a decision repeated six times is a decision that will
   * eventually be made differently in one of them.
   */
  private stateFor(conversation: ConversationForAccess): ConversationState {
    return conversation.viewerState ?? conversation.state;
  }

  private isParticipant(viewerId: string, conversation: ConversationForAccess): boolean {
    return conversation.participantIds.includes(viewerId);
  }
}
