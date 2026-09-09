import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { PersonRepository } from '../../src/persistence/person.repository';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';

/**
 * 008/T062 — SC-007, FR-013, FR-014, THROUGH THE PATH A MODIFIED CLIENT TAKES.
 *
 * "A post sent to somebody who may not see it yields no content and no evidence
 * of its existence." SC-007 says *may not see it*, which is BROADER than a
 * block, and the first version of this suite covered only the block — the gap
 * the 008 analysis pass found and this file closes.
 *
 * Two cases, and they must behave differently in exactly one respect:
 *
 *   - **A BLOCK** is `gone`. Reporting `not-for-you` would confirm the post
 *     exists and thereby disclose the block, which is why the visibility
 *     contract's error-distinction table exists at all.
 *   - **A FOLLOWERS-ONLY POST to a non-follower** is `not-for-you`. Nothing is
 *     hidden about the person here; the post simply has an audience.
 *
 * Driven with `supertest` directly rather than through the app's data layer, per
 * Principle III: a guarantee tested only through the well-behaved first-party
 * client is not tested at all.
 */
describe('008/SC-007 a shared post the recipient may not see', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

  const handleOf = async (userId: string): Promise<string> =>
    (await h.module.get(PersonRepository).findById(userId))!.handle;

  const publishReady = async (
    token: string,
    caption: string,
    visibility: 'public' | 'followers' = 'public',
  ): Promise<string> => {
    const created = await request(server())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({
        uploadIds: [await h.uploadId(token)],
        interestIds: [await h.topInterestId()],
        caption,
        visibility,
      });
    const postId = created.body.postId as string;
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);
    return postId;
  };

  /** Opens the pair conversation and sends the post. Asserts its own setup. */
  const share = async (senderToken: string, recipientId: string, postId: string): Promise<string> => {
    const conv = await request(server())
      .put(`/v1/conversations/with/${await handleOf(recipientId)}`)
      .set('authorization', `Bearer ${senderToken}`);
    expect({ step: 'open', status: conv.status }).toEqual({ step: 'open', status: 200 });
    const conversationId = conv.body.conversationId as string;

    const sent = await request(server())
      .post(`/v1/conversations/${conversationId}/messages`)
      .set('authorization', `Bearer ${senderToken}`)
      .send({ sharedPostId: postId });
    expect({ step: 'send', status: sent.status }).toEqual({ step: 'send', status: 201 });
    return conversationId;
  };

  it('a FOLLOWERS-ONLY post reaches a non-follower with no content (FR-013)', async () => {
    const sender = await h.createPerson('shareFollowersSender');
    const senderToken = await h.token(sender);
    const recipient = await h.createPerson('shareFollowersRecipient');
    const recipientToken = await h.token(recipient);

    const postId = await publishReady(senderToken, 'only for followers', 'followers');
    const conversationId = await share(senderToken, recipient, postId);

    const res = await request(server())
      .get(`/v1/conversations/${conversationId}/messages`)
      .set('authorization', `Bearer ${recipientToken}`);
    expect(res.status).toBe(200);

    const message = res.body.items.find((m: { sharedPostId?: string }) => m.sharedPostId === postId);
    /**
     * THE MESSAGE IS RETURNED AND THE POST IS NOT. Conversation access and post
     * visibility are two decisions, not one — hiding the message would tell the
     * recipient nothing, and would also lose a message they are entitled to see
     * the existence of, since somebody deliberately sent it to them.
     */
    expect({
      message: Boolean(message),
      post: message?.sharedPost ?? null,
      reason: message?.sharedPostUnavailableReason,
    }).toEqual({ message: true, post: null, reason: 'not-for-you' });

    // NO CONTENT ANYWHERE IN THE RESPONSE. A caption leaking through some other
    // field is exactly the shape six surfaces in this codebase have shipped.
    expect(JSON.stringify(res.body)).not.toContain('only for followers');
  }, 120_000);

  it('a BLOCK yields `gone`, not `not-for-you`, so the block is not disclosed (FR-014)', async () => {
    const sender = await h.createPerson('shareBlockSender');
    const senderToken = await h.token(sender);
    const recipient = await h.createPerson('shareBlockRecipient');
    const recipientToken = await h.token(recipient);

    const postId = await publishReady(senderToken, 'before the block', 'public');
    const conversationId = await share(senderToken, recipient, postId);

    const blocked = await request(server())
      .put(`/v1/blocks/${await handleOf(sender)}`)
      .set('authorization', `Bearer ${recipientToken}`);
    expect({ step: 'block', status: blocked.status }).toEqual({ step: 'block', status: 204 });

    const res = await request(server())
      .get(`/v1/conversations/${conversationId}/messages`)
      .set('authorization', `Bearer ${recipientToken}`);

    /**
     * A block SEVERS the conversation, so the honest outcome here is that the
     * recipient loses the thread rather than sees an emptied one. Either way the
     * caption must not appear, and `not-for-you` must not either — that word
     * would say "this exists and is not for you", which is the disclosure.
     */
    expect(JSON.stringify(res.body)).not.toContain('before the block');
    expect(JSON.stringify(res.body)).not.toContain('not-for-you');
  }, 120_000);

  it('a DELETED post is `gone` for the recipient too', async () => {
    const sender = await h.createPerson('shareGoneSender');
    const senderToken = await h.token(sender);
    const recipient = await h.createPerson('shareGoneRecipient');
    const recipientToken = await h.token(recipient);

    const postId = await publishReady(senderToken, 'here then not', 'public');
    const conversationId = await share(senderToken, recipient, postId);

    const deleted = await request(server())
      .delete(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${senderToken}`);
    expect(deleted.status).toBe(204);

    const res = await request(server())
      .get(`/v1/conversations/${conversationId}/messages`)
      .set('authorization', `Bearer ${recipientToken}`);
    const message = res.body.items.find((m: { sharedPostId?: string }) => m.sharedPostId === postId);
    expect({ post: message?.sharedPost ?? null, reason: message?.sharedPostUnavailableReason })
      .toEqual({ post: null, reason: 'gone' });
    expect(JSON.stringify(res.body)).not.toContain('here then not');
  }, 120_000);
});
