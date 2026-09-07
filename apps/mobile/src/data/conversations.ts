import type { Conversation, ConversationState, ConversationSummary, Message } from '@sih/shared';
import type { DataClient } from './client';

export interface ConversationPage {
  items: ConversationSummary[];
  nextCursor?: string;
}

export interface MessagePage {
  items: Message[];
  nextCursor?: string;
}

/**
 * Conversations (004/US1).
 *
 * No react-native imports below this file - apps/e2e drives these exact modules
 * in Node against a running API, which is the only reason the journeys prove
 * anything about the app rather than about a generated client.
 */
export class ConversationsData {
  constructor(private readonly client: DataClient) {}

  /** FR-003. `requested` is the separate inbox, not a filter over one list. */
  list(
    opts: { state?: ConversationState; limit?: number; cursor?: string } = {},
  ): Promise<ConversationPage> {
    return this.client.call<ConversationPage>('getConversations', {
      query: { state: opts.state ?? 'accepted', limit: opts.limit, cursor: opts.cursor },
    });
  }

  /**
   * FR-001. Idempotent: the id is derived from the participant pair, so calling
   * this twice returns the same thread rather than making a second one.
   */
  open(handle: string): Promise<Conversation> {
    return this.client.call<Conversation>('putConversationsWithByHandle', { params: { handle } });
  }

  get(conversationId: string): Promise<Conversation> {
    return this.client.call<Conversation>('getConversationsByConversationId', {
      params: { conversationId },
    });
  }

  /**
   * FR-011. With `waitSeconds` the server holds the request open until something
   * newer than `after` exists, so delivery is sub-second with ONE in-flight
   * request per open conversation rather than one per second.
   *
   * An empty `items` with a 200 is a NORMAL timeout on a quiet conversation, not
   * an error. Callers re-issue.
   */
  messages(
    conversationId: string,
    opts: { after?: string; limit?: number; waitSeconds?: number } = {},
  ): Promise<MessagePage> {
    return this.client.call<MessagePage>('getConversationsByConversationIdMessages', {
      params: { conversationId },
      query: { after: opts.after, limit: opts.limit, wait: opts.waitSeconds },
    });
  }

  send(
    conversationId: string,
    input: { body?: string; sharedPostId?: string },
  ): Promise<Message | null> {
    return this.client.call<Message | null>('postConversationsByConversationIdMessages', {
      params: { conversationId },
      body: input,
    });
  }

  accept(conversationId: string): Promise<void> {
    return this.client.call<void>('postConversationsByConversationIdAccept', {
      params: { conversationId },
    });
  }

  decline(conversationId: string): Promise<void> {
    return this.client.call<void>('postConversationsByConversationIdDecline', {
      params: { conversationId },
    });
  }

  /** FR-010. */
  markRead(conversationId: string, upToMessageId: string): Promise<void> {
    return this.client.call<void>('putConversationsByConversationIdRead', {
      params: { conversationId },
      body: { upToMessageId },
    });
  }

  // ---------------------------------------------------------------- feature 005

  /**
   * 005/FR-018, FR-027. Start a group - or resolve to an existing pair.
   *
   * A single handle is not an error: the server routes it to the pair path, so
   * this never creates a second conversation alongside the one-to-one thread
   * with that person. The response's `kind` says which happened.
   */
  createGroup(input: { participantHandles: string[]; name?: string | null }): Promise<Conversation> {
    return this.client.call<Conversation>('postConversationsGroups', { body: input });
  }

  /** 005/FR-020. Idempotent for somebody already present. */
  addParticipant(conversationId: string, handle: string): Promise<void> {
    return this.client.call<void>('postConversationsByConversationIdParticipants', {
      params: { conversationId },
      body: { handle },
    });
  }

  /** 005/FR-021. Messages already sent remain readable to the rest. */
  leave(conversationId: string): Promise<void> {
    return this.client.call<void>('postConversationsByConversationIdLeave', {
      params: { conversationId },
    });
  }
}
