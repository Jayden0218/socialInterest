import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { DomainError } from '../../common/errors/problem.filter';
import {
  ConversationAccess,
  type ConversationForAccess,
  type ConversationState,
} from '../../conversations/conversation-access';
import {
  ConversationRepository,
  type ConversationItem,
} from '../../persistence/conversation.repository';
import { MessageRepository, type MessageItem } from '../../persistence/message.repository';
import { PersonRepository } from '../../persistence/person.repository';
import { PersonFollowRepository } from '../../persistence/person-follow.repository';
import { BlockRepository } from '../../persistence/block.repository';
import { EVENT_BUS, type EventBus } from '../../ports';
import { conversationIdFor, participantPair } from './conversation-id';

const PREVIEW_MAX = 140;

@Injectable()
export class ConversationService {
  constructor(
    @Inject(ConversationRepository) private readonly conversations: ConversationRepository,
    @Inject(MessageRepository) private readonly messages: MessageRepository,
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(PersonFollowRepository) private readonly follows: PersonFollowRepository,
    @Inject(BlockRepository) private readonly blocks: BlockRepository,
    @Inject(ConversationAccess) private readonly access: ConversationAccess,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  /**
   * Loads a conversation in the shape ConversationAccess decides on.
   *
   * SEVERANCE IS COMPUTED, NOT STORED. A block resolves to `state: severed`
   * here rather than being written to the item, because FR-006 says unblocking
   * returns the conversation to its PRIOR state - and a stored `severed` has
   * destroyed what that was. It also means a block placed before a conversation
   * existed still severs it, with no sweep to get wrong.
   *
   * The boundary itself stays pure and does no I/O, which is what lets its
   * 48-assertion table be a unit test.
   */
  async forAccess(
    viewerId: string,
    conversationId: string,
  ): Promise<{ item: ConversationItem; view: ConversationForAccess } | null> {
    const item = await this.conversations.find(conversationId);
    if (!item) return null;

    const other = item.participantIds.find((id) => id !== viewerId);
    const [blocked, participants] = await Promise.all([
      other ? this.blocks.existsBetween(item.participantIds[0]!, item.participantIds[1]!) : false,
      Promise.all(item.participantIds.map((id) => this.people.findById(id))),
    ]);

    return {
      item,
      view: {
        conversationId: item.conversationId,
        participantIds: item.participantIds,
        initiatorId: item.initiatorId,
        state: blocked ? 'severed' : item.state,
        participantInactive: participants.some((p) => !p || p.status !== 'active'),
      },
    };
  }

  /** Every refusal in this module goes through here, so none can drift. */
  private refuse(viewerId: string, view: ConversationForAccess | null): never {
    const reason = this.access.refusal(viewerId, view);
    if (reason === 'unauthenticated') throw new DomainError(HttpStatus.UNAUTHORIZED, 'Sign in to continue');
    // `not-found` for a conversation that does not exist, for one the viewer is
    // not in, AND for one severed by a block - deliberately indistinguishable,
    // so neither membership nor a block is disclosed (FR-006).
    throw new DomainError(HttpStatus.NOT_FOUND, 'Not found');
  }

  /**
   * FR-001. Idempotent - the id is derived, so this returns the existing thread.
   *
   * State on creation: `accepted` when the RECIPIENT already follows the person
   * opening it, `requested` otherwise (FR-003). The asymmetry is the point - it
   * is the recipient's relationship that decides, not the sender's.
   */
  async open(viewerId: string, handle: string): Promise<ConversationItem> {
    const target = await this.people.findByHandle(handle.toLowerCase());
    if (!target || target.status !== 'active') throw new DomainError(HttpStatus.NOT_FOUND, 'Not found');
    if (target.userId === viewerId) {
      throw new DomainError(HttpStatus.UNPROCESSABLE_ENTITY, 'You cannot message yourself');
    }
    // 404, never 403: a block must not be disclosed by the failure to open.
    if (await this.blocks.existsBetween(viewerId, target.userId)) {
      throw new DomainError(HttpStatus.NOT_FOUND, 'Not found');
    }

    const conversationId = conversationIdFor(viewerId, target.userId);
    const existing = await this.conversations.find(conversationId);
    if (existing) return existing;

    const state: ConversationState = (await this.follows.isFollowing(target.userId, viewerId))
      ? 'accepted'
      : 'requested';

    const now = new Date().toISOString();
    await this.conversations.createIfAbsent({
      conversationId,
      participantIds: participantPair(viewerId, target.userId),
      initiatorId: viewerId,
      state,
      now,
    });
    // Re-read rather than returning what we tried to write: on a lost race the
    // winner's row is the truth, and it may carry a different initiator.
    const stored = await this.conversations.find(conversationId);
    if (!stored) throw new DomainError(HttpStatus.INTERNAL_SERVER_ERROR, 'Could not open the conversation');
    return stored;
  }

  async listInbox(
    viewerId: string,
    state: ConversationState,
    opts: { limit?: number; cursor?: string | null },
  ) {
    const page = await this.conversations.listInbox(viewerId, state, opts);
    const others = await Promise.all(page.items.map((i) => this.people.findById(i.otherUserId)));
    return {
      items: page.items.map((row, i) => {
        const other = others[i];
        return {
          conversationId: row.conversationId,
          other: other
            ? { userId: other.userId, handle: other.handle, displayName: other.displayName }
            : { userId: row.otherUserId, handle: 'unavailable', displayName: 'Unavailable' },
          state: row.state,
          lastMessageAt: row.lastMessageAt,
          lastMessagePreview: row.lastMessagePreview ?? null,
          unreadCount: row.unreadCount ?? 0,
        };
      }),
      nextCursor: page.nextCursor,
    };
  }

  async get(viewerId: string, conversationId: string) {
    const loaded = await this.forAccess(viewerId, conversationId);
    if (!loaded || !this.access.canRead(viewerId, loaded.view)) {
      this.refuse(viewerId, loaded?.view ?? null);
    }
    return this.present(viewerId, loaded.item, loaded.view);
  }

  private async present(
    viewerId: string,
    item: ConversationItem,
    view: ConversationForAccess,
  ) {
    const otherId = item.participantIds.find((id) => id !== viewerId)!;
    const [other, participant] = await Promise.all([
      this.people.findById(otherId),
      this.conversations.findParticipant(viewerId, item.conversationId),
    ]);
    return {
      conversationId: item.conversationId,
      other: other
        ? { userId: other.userId, handle: other.handle, displayName: other.displayName }
        : { userId: otherId, handle: 'unavailable', displayName: 'Unavailable' },
      state: view.state,
      lastMessageAt: item.lastMessageAt,
      lastMessagePreview: participant?.lastMessagePreview ?? null,
      unreadCount: participant?.unreadCount ?? 0,
      viewerCanSend: this.access.canWrite(viewerId, view),
      initiatedByViewer: item.initiatorId === viewerId,
    };
  }

  /**
   * FR-001, FR-005, FR-008, FR-009.
   *
   * Returns null when the send was accepted and DISCARDED - a declined
   * conversation. The controller turns that into 202. The sender is not told,
   * for the same reason a blocked post is a 404: a sender who learns they were
   * declined has a reason to come back with another account.
   */
  async send(
    viewerId: string,
    conversationId: string,
    input: { body?: string; sharedPostId?: string },
  ): Promise<MessageItem | null> {
    const loaded = await this.forAccess(viewerId, conversationId);
    if (!loaded || !this.access.canRead(viewerId, loaded.view)) {
      this.refuse(viewerId, loaded?.view ?? null);
    }
    const { item } = loaded;
    let view = loaded.view;

    if (this.access.refusal(viewerId, view) === 'silently-discarded') return null;
    if (!this.access.canWrite(viewerId, view)) this.refuse(viewerId, view);

    const initiatorMessageCount =
      view.state === 'requested' ? await this.messages.countBy(conversationId, item.initiatorId) : 0;
    if (!this.access.canSendNow(viewerId, view, { initiatorMessageCount })) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'Wait for a reply before sending again',
        'One unanswered message is the limit until the conversation is accepted (FR-005).',
      );
    }

    /**
     * REPLYING IS WHAT ACCEPTS.
     *
     * A recipient who answers has plainly accepted, and making them tap Accept
     * as well is a control that exists only in the data model. Without this the
     * conversation stays `requested` forever: the recipient can reply as often
     * as they like, and the initiator is refused on their second message with
     * "wait for a reply" - to a reply they already got.
     *
     * Found by the FR-012 feed journey, which held an ordinary three-message
     * conversation and could not. None of the twelve tests written directly
     * against the request rules caught it, because each of them sent one message
     * and asserted the refusal.
     */
    if (view.state === 'requested' && viewerId !== item.initiatorId) {
      await this.conversations.setState(item, 'accepted');
      item.state = 'accepted';
      view = { ...view, state: 'accepted' };
    }

    const now = new Date().toISOString();
    const message: MessageItem = {
      messageId: ulid(),
      conversationId,
      authorId: viewerId,
      body: input.body ?? null,
      sharedPostId: input.sharedPostId ?? null,
      moderationState: 'visible',
      createdAt: now,
    };
    const preview = (input.body ?? (input.sharedPostId ? 'Shared a post' : '')).slice(0, PREVIEW_MAX);

    await this.writeMessage(item, message, preview, now);

    // AFTER the write, so a waiter woken by this event finds the message when it
    // looks. Publishing first is a race that only shows up under load.
    await this.events.publish({
      type: 'message.created',
      payload: { conversationId, messageId: message.messageId, authorId: viewerId },
    });

    return message;
  }

  /**
   * The message and both inbox rows, atomically.
   *
   * Three items, fixed - which is why group chat is out of scope rather than
   * "later": a growing participant set turns this into a transaction whose size
   * depends on the data.
   */
  private async writeMessage(
    item: ConversationItem,
    message: MessageItem,
    preview: string,
    now: string,
  ): Promise<void> {
    await this.conversations.applyMessage({
      conversation: item,
      messagePut: this.messages.buildPut(message),
      authorId: message.authorId,
      preview,
      now,
    });
  }

  /** FR-005. Only the recipient may accept or decline. */
  async respondToRequest(
    viewerId: string,
    conversationId: string,
    decision: 'accepted' | 'declined',
  ): Promise<void> {
    const loaded = await this.forAccess(viewerId, conversationId);
    if (!loaded || !this.access.canRead(viewerId, loaded.view)) {
      this.refuse(viewerId, loaded?.view ?? null);
    }
    const { item, view } = loaded;
    // The initiator accepting their own request would be a way to bypass the
    // control entirely, so it is a 404 rather than a 403 - same rule as above.
    if (view.initiatorId === viewerId) throw new DomainError(HttpStatus.NOT_FOUND, 'Not found');
    if (view.state !== 'requested') return;
    await this.conversations.setState(item, decision);
  }

  /** FR-010. */
  async markRead(viewerId: string, conversationId: string, upToMessageId: string): Promise<void> {
    const loaded = await this.forAccess(viewerId, conversationId);
    if (!loaded || !this.access.canRead(viewerId, loaded.view)) {
      this.refuse(viewerId, loaded?.view ?? null);
    }
    const message = await this.messages.find(conversationId, upToMessageId);
    if (!message) throw new DomainError(HttpStatus.NOT_FOUND, 'No such message');
    await this.conversations.markRead(viewerId, conversationId, message.createdAt);
  }
}
