import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';
import type { ConversationState } from '../conversations/conversation-access';

export interface ConversationItem {
  conversationId: string;
  participantIds: string[];
  initiatorId: string;
  state: ConversationState;
  lastMessageAt: string;
  createdAt: string;
}

export interface ConversationParticipantItem {
  conversationId: string;
  userId: string;
  otherUserId: string;
  state: ConversationState;
  lastMessageAt: string;
  lastReadAt: string | null;
  unreadCount: number;
  lastMessagePreview: string | null;
}

/**
 * The meta item is the AUTHORITY for `state`; the two participant rows carry a
 * copy so an inbox renders from one Query. On disagreement the meta item wins,
 * and ConversationAccess is only ever handed the meta item.
 *
 * Every state change writes all three in ONE TransactWriteItems. The set is
 * fixed at three, so it is always inside DynamoDB's limits - unlike a design
 * where the participant set can grow, which is one of the reasons group chat is
 * out of scope rather than "later".
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
}
