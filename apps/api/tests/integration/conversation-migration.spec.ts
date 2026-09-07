import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { ConversationRepository } from '../../src/persistence/conversation.repository';
import { conversationIdFor } from '../../src/modules/conversations/conversation-id';
import { keys } from '../../src/persistence/keys';

/**
 * SC-008, AND THE REASON IT IS WORDED THE WAY IT IS.
 *
 * 005/R2 moves the authority for `state` from the conversation item to the
 * participant row, because a group has no single state that is not a lie about
 * somebody. That is a change to how every EXISTING conversation is read.
 *
 * "Existing conversations still work", verified by creating new ones under the
 * new code, proves nothing at all about the rows already on disk - the new write
 * path would produce whatever the new read path expects, and the test would pass
 * against a migration that never ran. 001's suites called `reconcile()` by hand
 * and hid a defect that made the entire product unusable; same shape.
 *
 * So this writes rows in the OLD SHAPE - state on the meta item, no `kind`, no
 * member rows, participant rows without `joinedAt` - and then reads them through
 * the new code.
 */
describe('005/G1 — conversations written before 005 still work (SC-008)', () => {
  let h: Harness;
  let repo: ConversationRepository;

  beforeAll(async () => {
    h = await bootHarness();
    repo = h.module.get(ConversationRepository);
  });

  afterAll(async () => {
    await h.close();
  });

  /**
   * Writes the exact item shape the 004 code produced. Deliberately NOT by
   * calling the current `createIfAbsent`, which is the thing under test.
   */
  const writeLegacyConversation = async (input: {
    a: string;
    b: string;
    state: 'requested' | 'accepted' | 'declined';
  }) => {
    const { a, b, state } = input;
    const conversationId = conversationIdFor(a, b);
    const now = new Date().toISOString();
    const pair = [a, b].sort();

    const put = (item: Record<string, unknown>) => ({
      Put: { TableName: (repo as unknown as { tableName: string }).tableName, Item: item },
    });

    await (repo as unknown as { transact: (i: unknown[]) => Promise<void> }).transact([
      put({
        ...keys.conversation(conversationId),
        type: 'Conversation',
        conversationId,
        participantIds: pair,
        initiatorId: a,
        // The OLD authority, and the only place the state lived.
        state,
        lastMessageAt: now,
        createdAt: now,
        // No `kind`, no `name`, no `creatorId` - none existed.
      }),
      ...pair.map((userId, i) =>
        put({
          ...keys.conversationParticipant(userId, conversationId),
          ...keys.conversationInbox(userId, state, now),
          type: 'ConversationParticipant',
          conversationId,
          userId,
          otherUserId: pair[1 - i]!,
          state,
          lastMessageAt: now,
          lastReadAt: null,
          unreadCount: 0,
          lastMessagePreview: null,
          // No `joinedAt`, no `addedBy` - neither existed.
        }),
      ),
    ]);

    return conversationId;
  };

  it('a legacy accepted conversation is readable under its ORIGINAL id', async () => {
    const a = await h.createPerson('legacyA');
    const b = await h.createPerson('legacyB');
    const conversationId = await writeLegacyConversation({ a, b, state: 'accepted' });

    const res = await request(h.app.getHttpServer())
      .get(`/v1/conversations/${conversationId}`)
      .set('authorization', `Bearer ${await h.token(a)}`);

    expect(res.status).toBe(200);
    // FR-026: the SAME id. A migration that re-keyed conversations would pass a
    // "can I read it" test and break every link, notification and client cache.
    expect(res.body.conversationId).toBe(conversationId);
    expect(res.body.state).toBe('accepted');
    // And it is still a pair - `kind` is absent on the row, so this proves the
    // read path defaults rather than crashing on a missing discriminator.
    expect(res.body.kind ?? 'pair').toBe('pair');
    expect(res.body.other).not.toBeNull();
  });

  it('a legacy conversation appears in the inbox it belongs in', async () => {
    const a = await h.createPerson('legacyInboxA');
    const b = await h.createPerson('legacyInboxB');
    const conversationId = await writeLegacyConversation({ a, b, state: 'accepted' });

    const res = await request(h.app.getHttpServer())
      .get('/v1/conversations?state=accepted')
      .set('authorization', `Bearer ${await h.token(b)}`);

    expect(res.status).toBe(200);
    expect(
      res.body.items.some((c: { conversationId: string }) => c.conversationId === conversationId),
    ).toBe(true);
  });

  /**
   * A legacy REQUEST must still be in Requests and still be acceptable. This is
   * the row where the old and new authorities could most easily disagree: the
   * state is on the meta item, the inbox partition is keyed by it, and the
   * participant row carries a copy.
   */
  it('a legacy request is still in Requests, and accepting it still works', async () => {
    const requester = await h.createPerson('legacyReq');
    const recipient = await h.createPerson('legacyRecip');
    const conversationId = await writeLegacyConversation({
      a: requester,
      b: recipient,
      state: 'requested',
    });

    const inbox = await request(h.app.getHttpServer())
      .get('/v1/conversations?state=requested')
      .set('authorization', `Bearer ${await h.token(recipient)}`);
    expect(
      inbox.body.items.some((c: { conversationId: string }) => c.conversationId === conversationId),
    ).toBe(true);

    const accepted = await request(h.app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/accept`)
      .set('authorization', `Bearer ${await h.token(recipient)}`);
    expect(accepted.status).toBe(204);

    const after = await request(h.app.getHttpServer())
      .get(`/v1/conversations/${conversationId}`)
      .set('authorization', `Bearer ${await h.token(recipient)}`);
    expect(after.body.state).toBe('accepted');
  });

  /**
   * And a message can still be sent into one. `applyMessage` writes one row per
   * participant, and a legacy row is missing fields the new code may assume.
   */
  it('a message can still be sent into a legacy conversation', async () => {
    const a = await h.createPerson('legacyMsgA');
    const b = await h.createPerson('legacyMsgB');
    const conversationId = await writeLegacyConversation({ a, b, state: 'accepted' });

    const sent = await request(h.app.getHttpServer())
      .post(`/v1/conversations/${conversationId}/messages`)
      .set('authorization', `Bearer ${await h.token(a)}`)
      .send({ body: 'still works' });
    expect(sent.status).toBe(201);

    const read = await request(h.app.getHttpServer())
      .get(`/v1/conversations/${conversationId}/messages`)
      .set('authorization', `Bearer ${await h.token(b)}`);
    expect(read.body.items.some((m: { body: string }) => m.body === 'still works')).toBe(true);
  });

  /**
   * The id derivation itself must not have moved. If `conversationIdFor` changed,
   * every legacy conversation becomes unreachable at once - and the failure would
   * look like "the conversation does not exist" rather than like a migration bug.
   */
  it('the pair id derivation is unchanged and still order-independent', () => {
    expect(conversationIdFor('u-aaa', 'u-bbb')).toBe(conversationIdFor('u-bbb', 'u-aaa'));
    expect(conversationIdFor('u-aaa', 'u-bbb')).toHaveLength(26);
  });
});
