import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';
import type { ConversationState } from '../conversations/conversation-access';

export interface ConversationItem {
  conversationId: string;
  participantIds: string[];
  initiatorId: string;
  /**
   * 005/R2. NO LONGER THE AUTHORITY - kept, written, and never read for a
   * decision.
   *
   * A group has no single state: Alice accepted, Bob has not looked, Jo
   * declined. There is no value this field could hold that is not false about
   * somebody, so the authority moved to the participant row, which already
   * carried a copy and already keys the inbox by it (GSI5).
   *
   * Left in place rather than deleted so a legacy row is never half-read: an
   * item written before 005 has it, and nothing new depends on it.
   */
  state: ConversationState;
  lastMessageAt: string;
  createdAt: string;
  /** 005/R1. Explicit, because the two kinds derive their ids differently. */
  kind?: 'pair' | 'group';
  /** 005/FR-024. User-generated content: reportable, moderatable. */
  name?: string | null;
  /** 005/R8. Set when a moderator blanks the name; the conversation survives. */
  nameRemovedByModeration?: boolean;
  /**
   * Who started it. Recorded for the moderation log, NOT used for authority -
   * nobody may remove another participant (spec Assumptions), so there is no
   * decision this field makes.
   */
  creatorId?: string;
}

export interface ConversationParticipantItem {
  conversationId: string;
  userId: string;
  /** Null for a group, which has no single other person. */
  otherUserId: string | null;
  /**
   * 005/R2. THE AUTHORITY for this person's relationship to this conversation.
   *
   * Per participant, because that is the only level at which the question has an
   * answer. `left` (FR-021) exists only here for the same reason: one person
   * leaving a group of four does not put the conversation in a state.
   */
  state: ConversationState;
  lastMessageAt: string;
  lastReadAt: string | null;
  unreadCount: number;
  lastMessagePreview: string | null;
  /** 005/FR-030. When they joined, and when they left - membership is history. */
  joinedAt?: string;
  leftAt?: string | null;
  addedBy?: string;
}

/**
 * THE PARTICIPANT ROW IS THE AUTHORITY for `state` (005/R2).
 *
 * It used to be the meta item, with the participant rows carrying a copy so an
 * inbox renders from one Query. That worked because a pair has exactly ONE
 * shared state. A group does not - Alice accepted, Bob has not looked, Jo
 * declined - so there is no value the meta item could hold that is not a lie
 * about somebody.
 *
 * The storage for this already existed and was already the right shape: the
 * participant row carried `state`, and GSI5 puts it in the PARTITION KEY, which
 * is what makes "my inbox" and "my requests" one query each. So 005 removed a
 * denormalised copy that only stayed honest for two people; it did not add a
 * mechanism.
 *
 * A state change still writes every row in ONE TransactWriteItems. This comment
 * used to name a growing participant set as a reason group chat was out of scope,
 * and that concern was RIGHT: DynamoDB caps a transaction at 100 items. It is
 * answered by the cap rather than by avoidance - 20 participants means a worst
 * case of 21 items (research R3), which is why FR-031 is enforced server-side
 * and why raising the cap is a correctness decision, not a product one.
 */
@Injectable()
export class ConversationRepository extends BaseRepository {
  async find(conversationId: string): Promise<ConversationItem | null> {
    return this.getItem<ConversationItem>(keys.conversation(conversationId));
  }

  /**
   * Creates the conversation and both inbox rows, or nothing.
   *
   * Idempotent by construction: the id is derived from the sorted participant
   * pair, so two people opening at once compute the same id. The condition makes
   * the loser a no-op rather than an overwrite that would reset `state` - which
   * would be a way to un-decline yourself.
   */
  async createIfAbsent(input: {
    conversationId: string;
    participantIds: [string, string];
    initiatorId: string;
    state: ConversationState;
    now: string;
  }): Promise<boolean> {
    const { conversationId, participantIds, initiatorId, state, now } = input;
    try {
      await this.transact([
        {
          Put: {
            TableName: this.tableName,
            Item: {
              ...keys.conversation(conversationId),
              type: 'Conversation',
              conversationId,
              participantIds,
              initiatorId,
              state,
              lastMessageAt: now,
              createdAt: now,
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
        ...participantIds.map((userId, i) => ({
          Put: {
            TableName: this.tableName,
            Item: {
              ...keys.conversationParticipant(userId, conversationId),
              ...keys.conversationInbox(userId, state, now),
              type: 'ConversationParticipant',
              conversationId,
              userId,
              otherUserId: participantIds[1 - i]!,
              state,
              lastMessageAt: now,
              lastReadAt: null,
              unreadCount: 0,
              lastMessagePreview: null,
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        })),
      ]);
      return true;
    } catch (e) {
      // TransactionCanceledException means somebody else got there first, which
      // is the intended outcome of a race, not a failure to report.
      if ((e as { name?: string }).name === 'TransactionCanceledException') return false;
      throw e;
    }
  }

  /**
   * A21/A22 - one inbox, in order, one Query.
   *
   * `state` is in the GSI5 partition key, so requests and accepted conversations
   * are separate partitions rather than one partition and a filter. A filter
   * would page wrongly: a page of 20 could return 3 after filtering.
   */
  async listInbox(
    userId: string,
    state: ConversationState,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<ConversationParticipantItem>> {
    return this.query<ConversationParticipantItem>(`USER#${userId}#${state}`, {
      indexName: 'gsi5',
      limit: opts.limit ?? 20,
      cursor: opts.cursor ?? null,
    });
  }

  async findParticipant(
    userId: string,
    conversationId: string,
  ): Promise<ConversationParticipantItem | null> {
    return this.getItem<ConversationParticipantItem>(
      keys.conversationParticipant(userId, conversationId),
    );
  }

  /** Every conversation a person is in, for the block-severance sweep. */
  async listAllFor(
    userId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<ConversationParticipantItem>> {
    return this.query<ConversationParticipantItem>(`USER#${userId}`, {
      skPrefix: SK_PREFIX.conversation,
      limit: opts.limit ?? 50,
      cursor: opts.cursor ?? null,
    });
  }

  /**
   * A message plus both inbox rows, in one transaction.
   *
   * Three items, fixed. The author's row gets a fresh `lastReadAt` because you
   * have read what you just sent; the other's `unreadCount` goes up. Both get a
   * new gsi5sk, which is what moves the conversation to the top of the inbox -
   * and because that is a GSI SORT key it is updated by writing the attribute,
   * with no delete-and-reinsert.
   */
  async applyMessage(input: {
    conversation: ConversationItem;
    messagePut: Record<string, unknown>;
    authorId: string;
    preview: string;
    now: string;
  }): Promise<void> {
    const { conversation, messagePut, authorId, preview, now } = input;
    await this.transact([
      { Put: { TableName: this.tableName, Item: messagePut } },
      {
        Update: {
          TableName: this.tableName,
          Key: keys.conversation(conversation.conversationId),
          UpdateExpression: 'SET lastMessageAt = :now',
          ExpressionAttributeValues: { ':now': now },
        },
      },
      ...conversation.participantIds.map((userId) => {
        const isAuthor = userId === authorId;
        return {
          Update: {
            TableName: this.tableName,
            Key: keys.conversationParticipant(userId, conversation.conversationId),
            UpdateExpression:
              'SET lastMessageAt = :now, lastMessagePreview = :p, gsi5sk = :isk' +
              (isAuthor ? ', lastReadAt = :now' : ' ADD unreadCount :one'),
            ExpressionAttributeValues: {
              ':now': now,
              ':p': preview,
              ':isk': keys.conversationInbox(userId, conversation.state, now).gsi5sk,
              ...(isAuthor ? {} : { ':one': 1 }),
            },
          },
        };
      }),
    ]);
  }

  /**
   * FR-010. Clears the unread count as of a point in time.
   *
   * REMOVE, not SET 0: a count that is set to zero races a message arriving
   * between the read and the write, and the person then never sees it as unread.
   * Clearing the attribute and recomputing from `lastReadAt` would be stricter
   * still; this is the version whose failure mode is an over-count, not an
   * under-count, which is the right direction to be wrong in.
   */
  async markRead(userId: string, conversationId: string, upTo: string): Promise<void> {
    await this.updateItem(keys.conversationParticipant(userId, conversationId), {
      lastReadAt: upTo,
      unreadCount: 0,
    });
  }

  /**
   * Moves a conversation to a new state, on the meta item and both inbox rows,
   * atomically. Rewriting gsi5pk is what moves it between inboxes.
   */
  async setState(
    conversation: ConversationItem,
    state: ConversationState,
  ): Promise<void> {
    await this.transact([
      {
        Update: {
          TableName: this.tableName,
          Key: keys.conversation(conversation.conversationId),
          UpdateExpression: 'SET #s = :s',
          ExpressionAttributeNames: { '#s': 'state' },
          ExpressionAttributeValues: { ':s': state },
        },
      },
      ...conversation.participantIds.map((userId) => ({
        Update: {
          TableName: this.tableName,
          Key: keys.conversationParticipant(userId, conversation.conversationId),
          UpdateExpression: 'SET #s = :s, gsi5pk = :ipk',
          ExpressionAttributeNames: { '#s': 'state' },
          ExpressionAttributeValues: {
            ':s': state,
            ':ipk': keys.conversationInbox(userId, state, conversation.lastMessageAt).gsi5pk,
          },
        },
      })),
    ]);
  }

  // ---------------------------------------------------------------- feature 005

  /**
   * Creates a GROUP: the meta item, one inbox row and one member row per person.
   *
   * 1 + 2N items. At the cap of 20 that is 41, inside DynamoDB's limit of 100 -
   * which is what research R3 means by the cap being a correctness constraint
   * rather than a preference. Above roughly 49 participants this transaction
   * stops being atomic, and a partial membership write leaves somebody able to
   * read a conversation they are not in.
   *
   * No conditional put and no idempotency: unlike a pair, "start a group with
   * these people" twice genuinely means two groups (research R1).
   */
  async createGroup(input: {
    conversationId: string;
    creatorId: string;
    name: string | null;
    members: { userId: string; state: ConversationState }[];
    now: string;
  }): Promise<void> {
    const { conversationId, creatorId, name, members, now } = input;
    const participantIds = members.map((m) => m.userId);

    await this.transact([
      {
        Put: {
          TableName: this.tableName,
          Item: {
            ...keys.conversation(conversationId),
            type: 'Conversation',
            conversationId,
            participantIds,
            initiatorId: creatorId,
            creatorId,
            kind: 'group',
            name,
            // Written but never read for a decision - the participant rows are
            // the authority (005/R2). Present so a reader that has not been
            // migrated cannot find the field missing.
            state: 'accepted' as ConversationState,
            lastMessageAt: now,
            createdAt: now,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
      ...members.flatMap((m) => [
        {
          Put: {
            TableName: this.tableName,
            Item: {
              ...keys.conversationParticipant(m.userId, conversationId),
              ...keys.conversationInbox(m.userId, m.state, now),
              type: 'ConversationParticipant',
              conversationId,
              userId: m.userId,
              // Null: a group has no single other person.
              otherUserId: null,
              state: m.state,
              lastMessageAt: now,
              lastReadAt: null,
              unreadCount: 0,
              lastMessagePreview: null,
              joinedAt: now,
              leftAt: null,
              addedBy: creatorId,
            },
          },
        },
        {
          Put: {
            TableName: this.tableName,
            Item: {
              ...keys.conversationMember(conversationId, m.userId),
              type: 'ConversationMember',
              conversationId,
              userId: m.userId,
              state: m.state,
              joinedAt: now,
            },
          },
        },
      ]),
    ]);
  }

  /**
   * A40. Every participant of a conversation.
   *
   * The member rows exist for exactly this: participation was stored only under
   * the PERSON's partition, which answers "am I in this?" but cannot list a
   * conversation's members without already knowing them. Fine for a pair, where
   * `participantIds` on the meta item IS the answer; not fine for a group whose
   * membership changes.
   */
  async listMembers(conversationId: string): Promise<{ userId: string; state: ConversationState; joinedAt: string }[]> {
    const page = await this.query<{ userId: string; state: ConversationState; joinedAt: string }>(
      `CONV#${conversationId}`,
      { skPrefix: SK_PREFIX.conversationMember, limit: 50, ascending: true },
    );
    return page.items;
  }

  /** FR-020. Adds one person: their inbox row, their member row, and the roster. */
  async addMember(input: {
    conversationId: string;
    userId: string;
    addedBy: string;
    state: ConversationState;
    participantIds: string[];
    now: string;
  }): Promise<void> {
    const { conversationId, userId, addedBy, state, participantIds, now } = input;
    await this.transact([
      {
        Update: {
          TableName: this.tableName,
          Key: keys.conversation(conversationId),
          UpdateExpression: 'SET participantIds = :p',
          ExpressionAttributeValues: { ':p': [...participantIds, userId] },
        },
      },
      {
        Put: {
          TableName: this.tableName,
          Item: {
            ...keys.conversationParticipant(userId, conversationId),
            ...keys.conversationInbox(userId, state, now),
            type: 'ConversationParticipant',
            conversationId,
            userId,
            otherUserId: null,
            state,
            lastMessageAt: now,
            lastReadAt: null,
            unreadCount: 0,
            lastMessagePreview: null,
            joinedAt: now,
            leftAt: null,
            addedBy,
          },
        },
      },
      {
        Put: {
          TableName: this.tableName,
          Item: {
            ...keys.conversationMember(conversationId, userId),
            type: 'ConversationMember',
            conversationId,
            userId,
            state,
            joinedAt: now,
          },
        },
      },
    ]);
  }

  /**
   * FR-021. Leaving.
   *
   * The rows are MARKED, not deleted. A deleted participant row would take the
   * person's `joinedAt` and `addedBy` with it, and FR-030 makes membership part
   * of the conversation's history rather than a mutable set. It also keeps their
   * messages attributable to somebody the conversation knows about.
   */
  async markLeft(conversationId: string, userId: string, now: string): Promise<void> {
    await this.transact([
      {
        Update: {
          TableName: this.tableName,
          Key: keys.conversationParticipant(userId, conversationId),
          UpdateExpression: 'SET #s = :left, leftAt = :now, gsi5pk = :pk',
          ExpressionAttributeNames: { '#s': 'state' },
          ExpressionAttributeValues: {
            ':left': 'left',
            ':now': now,
            // Moves them out of their accepted inbox partition, which is what
            // makes "stop receiving it" true at the query rather than by filter.
            ':pk': keys.conversationInbox(userId, 'left', now).gsi5pk,
          },
        },
      },
      {
        Update: {
          TableName: this.tableName,
          Key: keys.conversationMember(conversationId, userId),
          UpdateExpression: 'SET #s = :left, leftAt = :now',
          ExpressionAttributeNames: { '#s': 'state' },
          ExpressionAttributeValues: { ':left': 'left', ':now': now },
        },
      },
    ]);
  }

  /** FR-024 and R8. Blanks a group's name without touching the conversation. */
  async removeName(conversationId: string): Promise<void> {
    await this.updateItem(keys.conversation(conversationId), {
      name: null,
      nameRemovedByModeration: true,
    });
  }

  /**
   * 005/R9. Used only by the backfill.
   *
   * Writes the participant's state AND its inbox partition key together - the
   * two must move as one, or the row says `accepted` while still sitting in the
   * requests partition, and the inbox query would disagree with the row it
   * returned.
   */
  async setParticipantState(
    userId: string,
    conversationId: string,
    state: ConversationState,
    lastMessageAt: string,
  ): Promise<void> {
    await this.updateItem(keys.conversationParticipant(userId, conversationId), {
      state,
      gsi5pk: keys.conversationInbox(userId, state, lastMessageAt).gsi5pk,
    });
  }

  /** 005/R2. This person's own state, which is the authority. */
  async participantState(userId: string, conversationId: string): Promise<ConversationState | null> {
    const row = await this.findParticipant(userId, conversationId);
    return row?.state ?? null;
  }
}
