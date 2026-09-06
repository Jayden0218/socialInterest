import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';

export interface MessageItem {
  messageId: string;
  conversationId: string;
  authorId: string;
  body: string | null;
  /**
   * A REFERENCE, never a copy.
   *
   * The post is resolved per reader through VisibilityFilter at read time, so a
   * later visibility change lands inside the conversation immediately. A
   * denormalised caption or thumbnail here would be a materialised copy that
   * outlives a visibility change - which Constitution II forbids introducing
   * without amending it first.
   */
  sharedPostId: string | null;
  moderationState: 'visible' | 'removed';
  createdAt: string;
}

@Injectable()
export class MessageRepository extends BaseRepository {
  /**
   * A24 - messages in creation order.
   *
   * Ascending, unlike every other list in this codebase: a conversation reads
   * oldest-first, and the long-poll cursor walks forward. `after` is a message
   * id, and because ids are ULIDs that is also a time ordering - no separate
   * timestamp key is needed.
   */
  async list(
    conversationId: string,
    opts: { limit?: number; after?: string | null } = {},
  ): Promise<Page<MessageItem>> {
    const page = await this.query<MessageItem>(`CONV#${conversationId}`, {
      skPrefix: SK_PREFIX.message,
      limit: opts.limit ?? 50,
      ascending: true,
    });
    if (!opts.after) return page;
    const items = page.items.filter((m) => m.messageId > opts.after!);
    return { items, nextCursor: page.nextCursor };
  }

  async latest(conversationId: string): Promise<MessageItem | null> {
    const page = await this.query<MessageItem>(`CONV#${conversationId}`, {
      skPrefix: SK_PREFIX.message,
      limit: 1,
      ascending: false,
    });
    return page.items[0] ?? null;
  }

  async find(conversationId: string, messageId: string): Promise<MessageItem | null> {
    return this.getItem<MessageItem>(keys.message(conversationId, messageId));
  }

  /** How many messages the initiator has sent - the one-unanswered-message rule. */
  async countBy(conversationId: string, authorId: string): Promise<number> {
    let count = 0;
    let cursor: string | null = null;
    do {
      const page: Page<MessageItem> = await this.query<MessageItem>(`CONV#${conversationId}`, {
        skPrefix: SK_PREFIX.message,
        limit: 100,
        cursor,
        ascending: true,
      });
      count += page.items.filter((m) => m.authorId === authorId).length;
      cursor = page.nextCursor;
      // The rule only needs to know "one or more", and a requested conversation
      // holds at most a handful. Stop early rather than walk a long thread.
      if (count > 0) return count;
    } while (cursor);
    return count;
  }

  /** Moderation removes CONTENT. The thread stays readable (addendum, rule 6). */
  async setModerationState(
    conversationId: string,
    messageId: string,
    state: MessageItem['moderationState'],
  ): Promise<void> {
    await this.updateItem(keys.message(conversationId, messageId), { moderationState: state });
  }

  /**
   * Appends a message. Callers write the participant rows in the same
   * transaction - see ConversationRepository - so this is the item builder, not
   * a standalone write path.
   */
  buildPut(message: MessageItem): Record<string, unknown> {
    return {
      ...keys.message(message.conversationId, message.messageId),
      type: 'Message',
      ...message,
    };
  }
}
