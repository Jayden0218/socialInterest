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
import { ProfileProjection } from '../people/profile.projection';
import { MessageRepository, type MessageItem } from '../../persistence/message.repository';
import { PersonRepository } from '../../persistence/person.repository';
import { PersonFollowRepository } from '../../persistence/person-follow.repository';
import { BlockRepository } from '../../persistence/block.repository';
import { EVENT_BUS, type EventBus } from '../../ports';
import { conversationIdFor, newGroupConversationId, participantPair } from './conversation-id';

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
    @Inject(ProfileProjection) private readonly profiles: ProfileProjection,
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

    const isGroup = item.kind === 'group';
    const other = item.participantIds.find((id) => id !== viewerId);
    const [blocked, participants, viewerState] = await Promise.all([
      /**
       * PAIR ONLY. 005/FR-023b: a block created after both people are already in
       * a group leaves the group unchanged - blocking somebody must not silently
       * drop you out of an unrelated conversation with four friends.
       *
       * The pair rule is untouched: there, a block still severs symmetrically,
       * and it is still COMPUTED rather than stored (004/FR-006), so unblocking
       * restores the prior state because nothing was destroyed.
       */
      !isGroup && other
        ? this.blocks.existsBetween(item.participantIds[0]!, item.participantIds[1]!)
        : false,
      Promise.all(item.participantIds.map((id) => this.people.findById(id))),
      // 005/R2. The authority, read once and handed to the pure boundary.
      this.conversations.participantState(viewerId, conversationId),
    ]);

    return {
      item,
      view: {
        conversationId: item.conversationId,
        participantIds: item.participantIds,
        initiatorId: item.initiatorId,
        state: blocked ? 'severed' : item.state,
        // Absent on a legacy row, in which case the meta item's state is still
        // the answer - which is exactly what FR-026 requires.
        ...(viewerState ? { viewerState: blocked ? 'severed' : viewerState } : {}),
        ...(item.kind ? { kind: item.kind } : {}),
        /**
         * A GROUP IS NOT READ-ONLY BECAUSE ONE PERSON LEFT.
         *
         * For a pair, a departed participant makes the thread a record rather
         * than a channel. For a group, the remaining people are still talking to
         * each other, so this only applies when NOBODY active is left.
         */
        participantInactive: isGroup
          ? participants.every((p) => !p || p.status !== 'active')
          : participants.some((p) => !p || p.status !== 'active'),
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
    // 005: `otherUserId` is null for a group, so only pair rows have somebody to
    // look up. A group identifies itself by its name or its participants
    // (FR-024), which the inbox row carries without a second read.
    const others = await Promise.all(
      page.items.map((i) => (i.otherUserId ? this.people.findById(i.otherUserId) : null)),
    );
    const metas = await Promise.all(
      page.items.map((i) => this.conversations.find(i.conversationId)),
    );
    return {
      items: await Promise.all(page.items.map(async (row, i) => {
        const other = others[i];
        const meta = metas[i];
        return {
          conversationId: row.conversationId,
          // 008/US5. One projection, so the person you are talking to has a face.
          other: row.otherUserId
            ? await this.profiles.fromPerson(row.otherUserId, other ?? null)
            : null,
          // Absent on a legacy row, and a legacy row is always a pair.
          kind: meta?.kind ?? 'pair',
          name: meta?.nameRemovedByModeration ? null : (meta?.name ?? null),
          state: row.state,
          lastMessageAt: row.lastMessageAt,
          lastMessagePreview: row.lastMessagePreview ?? null,
          unreadCount: row.unreadCount ?? 0,
        };
      })),
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
    const isGroup = item.kind === 'group';
    const otherId = item.participantIds.find((id) => id !== viewerId);
    const [other, participant, members] = await Promise.all([
      !isGroup && otherId ? this.people.findById(otherId) : null,
      this.conversations.findParticipant(viewerId, item.conversationId),
      isGroup ? this.conversations.listMembers(item.conversationId) : Promise.resolve([]),
    ]);

    // FR-025. Membership is STORED and read from the member rows, never derived
    // from the id - which for a group carries no information at all.
    const people = await Promise.all(members.map((m) => this.people.findById(m.userId)));

    return {
      conversationId: item.conversationId,
      // Null for a group: there is no single other person. Kept populated for
      // every pair so a client built against the 004 contract still works.
      other:
        isGroup || !otherId ? null : await this.profiles.fromPerson(otherId, other ?? null),
      kind: item.kind ?? 'pair',
      name: item.nameRemovedByModeration ? null : (item.name ?? null),
      // The VIEWER's state, which for a group is the only one that means
      // anything (005/R2).
      state: view.viewerState ?? view.state,
      lastMessageAt: item.lastMessageAt,
      lastMessagePreview: participant?.lastMessagePreview ?? null,
      unreadCount: participant?.unreadCount ?? 0,
      viewerCanSend: this.access.canWrite(viewerId, view),
      initiatedByViewer: item.initiatorId === viewerId,
      ...(isGroup
        ? {
            participants: await Promise.all(
              members.map(async (m, i) => ({
                person: await this.profiles.fromPerson(m.userId, people[i] ?? null),
                state: m.state,
                joinedAt: m.joinedAt,
              })),
            ),
          }
        : {}),
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
      this.access.stateOf(view) === 'requested'
        ? await this.messages.countBy(conversationId, item.initiatorId)
        : 0;
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
    if (this.access.stateOf(view) === 'requested' && viewerId !== item.initiatorId) {
      await this.acceptFor(viewerId, item, view);
      view = this.accepted(view);
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
    if (this.access.stateOf(view) !== 'requested') return;
    await this.setStateFor(viewerId, item, view, decision);
  }

  /**
   * 005/R2. WHOSE STATE IS THIS.
   *
   * For a pair, the conversation's state and both people's are the same fact,
   * and `setState` writes the meta item and both participant rows together -
   * which is also what a legacy row needs (FR-026).
   *
   * For a GROUP it is one person's, and only theirs. `setState` there would
   * write every participant row, so one invitee accepting would accept on behalf
   * of the four people who had not looked and the one who declined - a decision
   * nobody made, taken silently, and invisible to any test that only holds
   * pairs.
   */
  private async setStateFor(
    viewerId: string,
    item: ConversationItem,
    view: ConversationForAccess,
    state: ConversationState,
  ): Promise<void> {
    if (view.kind === 'group') {
      await this.conversations.setParticipantState(
        viewerId,
        item.conversationId,
        state,
        item.lastMessageAt,
      );
      return;
    }
    await this.conversations.setState(item, state);
    item.state = state;
  }

  private acceptFor(
    viewerId: string,
    item: ConversationItem,
    view: ConversationForAccess,
  ): Promise<void> {
    return this.setStateFor(viewerId, item, view, 'accepted');
  }

  /**
   * The in-memory view after an accept, kept consistent with which field the
   * write above actually touched - so the rest of `send` decides from the same
   * authority the row now carries.
   */
  private accepted(view: ConversationForAccess): ConversationForAccess {
    return view.kind === 'group'
      ? { ...view, viewerState: 'accepted' }
      : { ...view, state: 'accepted', ...(view.viewerState ? { viewerState: 'accepted' } : {}) };
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

  // ---------------------------------------------------------------- feature 005

  /** 005/FR-031. A transactional limit, not a preference - research R3. */
  static readonly MAX_PARTICIPANTS = 20;

  /**
   * FR-023a. THE ONE REFUSAL for "this person cannot be added".
   *
   * Every reason returns THIS, byte for byte. The helpful version - "Sam has
   * blocked you" - tells the person adding their friend something about a
   * relationship between two OTHER people, neither of whom chose to share it,
   * and turns adding somebody to a group into a way to probe who has blocked
   * whom. SC-012 compares the refusals as literal responses, because a message
   * that differs only in wording leaks the block just as well.
   *
   * A method rather than a constant so there is exactly one construction site;
   * two `new DomainError(409, '...')` calls are two strings that can drift.
   */
  private cannotAdd(): DomainError {
    return new DomainError(HttpStatus.CONFLICT, 'That person cannot be added to this conversation');
  }

  /**
   * FR-018, FR-027. Start a group - or resolve to the existing pair.
   *
   * A single participant is NOT an error. FR-027 says a "group" of two must not
   * create a second conversation alongside the existing one-to-one thread, and
   * routing it to `open()` here is what makes that fall out of R1's id scheme
   * rather than needing its own check: the pair path computes the derived id and
   * finds what is already there.
   */
  async createGroup(
    creatorId: string,
    handles: string[],
    name: string | null,
  ): Promise<ConversationItem> {
    const unique = [...new Set(handles.map((h) => h.toLowerCase()))];
    if (unique.length === 0) {
      throw new DomainError(HttpStatus.UNPROCESSABLE_ENTITY, 'A conversation needs somebody in it');
    }
    // +1 for the creator. Checked BEFORE any lookup, so an oversized request
    // cannot be used to probe which handles exist.
    if (unique.length + 1 > ConversationService.MAX_PARTICIPANTS) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        `A conversation can have at most ${ConversationService.MAX_PARTICIPANTS} people`,
      );
    }

    if (unique.length === 1) return this.open(creatorId, unique[0]!);

    const people = await Promise.all(unique.map((h) => this.people.findByHandle(h)));
    const members: string[] = [];
    for (const person of people) {
      // A handle that does not exist and a person who cannot be added are the
      // SAME refusal. Distinguishing them would make this endpoint a way to test
      // whether a handle exists, and then whether it has blocked you.
      if (!person || person.status !== 'active' || person.userId === creatorId) {
        throw this.cannotAdd();
      }
      members.push(person.userId);
    }

    // FR-023: both directions, against every participant including the creator.
    const everyone = [creatorId, ...members];
    for (const a of everyone) {
      for (const b of everyone) {
        if (a >= b) continue;
        if (await this.blocks.existsBetween(a, b)) throw this.cannotAdd();
      }
    }

    /**
     * FR-022. An invitation from somebody you do not follow waits in Requests -
     * the same rule the pair case applies to an unsolicited first message, and
     * for the same reason: being added to a group by a stranger is the group
     * version of being messaged by one.
     */
    const states = await Promise.all(
      members.map(async (userId) =>
        (await this.follows.isFollowing(userId, creatorId)) ? 'accepted' : 'requested',
      ),
    );

    const conversationId = newGroupConversationId();
    const now = new Date().toISOString();
    await this.conversations.createGroup({
      conversationId,
      creatorId,
      name: name?.trim() ? name.trim().slice(0, 60) : null,
      members: [
        { userId: creatorId, state: 'accepted' as ConversationState },
        ...members.map((userId, i) => ({ userId, state: states[i]! as ConversationState })),
      ],
      now,
    });

    const stored = await this.conversations.find(conversationId);
    if (!stored) throw new DomainError(HttpStatus.INTERNAL_SERVER_ERROR, 'Could not create the conversation');
    return stored;
  }

  /** FR-020. Idempotent for somebody already present. */
  async addParticipant(viewerId: string, conversationId: string, handle: string): Promise<void> {
    const conversation = await this.conversations.find(conversationId);
    if (!conversation || conversation.kind !== 'group') {
      throw new DomainError(HttpStatus.NOT_FOUND, 'Not found');
    }
    const viewerState = await this.conversations.participantState(viewerId, conversationId);
    if (!viewerState || viewerState === 'left') {
      throw new DomainError(HttpStatus.FORBIDDEN, 'You are not in this conversation');
    }

    const target = await this.people.findByHandle(handle.toLowerCase());
    if (!target || target.status !== 'active') throw this.cannotAdd();
    // Already present: a no-op, not an error and not a second row.
    if (conversation.participantIds.includes(target.userId)) return;

    if (conversation.participantIds.length + 1 > ConversationService.MAX_PARTICIPANTS) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        `A conversation can have at most ${ConversationService.MAX_PARTICIPANTS} people`,
      );
    }

    // FR-023 against EVERY current participant, not just the one adding.
    for (const existing of conversation.participantIds) {
      if (await this.blocks.existsBetween(existing, target.userId)) throw this.cannotAdd();
    }

    const state: ConversationState = (await this.follows.isFollowing(target.userId, viewerId))
      ? 'accepted'
      : 'requested';
    const now = new Date().toISOString();
    await this.conversations.addMember({
      conversationId,
      userId: target.userId,
      addedBy: viewerId,
      state,
      participantIds: conversation.participantIds,
      now,
    });
  }

  /** FR-021. */
  async leave(viewerId: string, conversationId: string): Promise<void> {
    const conversation = await this.conversations.find(conversationId);
    if (!conversation || conversation.kind !== 'group') {
      // A pair conversation cannot be left - there is nothing to leave it TO.
      // Blocking is the tool for that, and it already exists.
      throw new DomainError(HttpStatus.NOT_FOUND, 'Not found');
    }
    const state = await this.conversations.participantState(viewerId, conversationId);
    if (!state || state === 'left') {
      throw new DomainError(HttpStatus.FORBIDDEN, 'You are not in this conversation');
    }
    await this.conversations.markLeft(conversationId, viewerId, new Date().toISOString());
  }
}
