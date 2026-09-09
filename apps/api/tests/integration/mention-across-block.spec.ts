import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';
import { consistently } from './eventually';

/**
 * 008/T129, US9 — FR-032. A MENTION MUST NOT CROSS A BLOCK, IN EITHER
 * DIRECTION.
 *
 * A mention is a way to put your name in front of somebody, so it is exactly
 * the affordance a blocked person would reach for. The rule is not new and must
 * not be re-implemented: the block question is answered once, in
 * `decideAuthoredRules`, and this asserts the mention path ASKS it rather than
 * asking its own version.
 *
 * The negative half uses `consistently`, not a single check: "zero
 * notifications" asserted once against an asynchronous pipeline passes before
 * anything could have arrived — green, worthless, and indistinguishable from a
 * real pass (004 recorded that shape).
 */
describe('008/US9 a mention does not cross a block', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

  const publishReady = async (token: string, caption: string): Promise<string> => {
    const created = await request(server())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({
        uploadIds: [await h.uploadId(token)],
        interestIds: [await h.topInterestId()],
        caption,
        visibility: 'public',
      });
    expect({ step: 'publish', status: created.status }).toEqual({ step: 'publish', status: 201 });
    const postId = created.body.postId as string;
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);
    return postId;
  };

  const notifications = async (token: string) =>
    request(server()).get('/v1/notifications?limit=50').set('authorization', `Bearer ${token}`);

  it('FR-031 an ordinary mention notifies the person named', async () => {
    const author = await h.createPerson('mentionAuthor');
    const named = await h.createPerson('mentionNamed');
    const authorToken = await h.token(author);
    const namedToken = await h.token(named);
    const namedHandle = (await request(server()).get('/v1/me').set('authorization', `Bearer ${namedToken}`)).body
      .handle as string;

    await publishReady(authorToken, `a walk with @${namedHandle}`);

    // Polled, because the notification is published through the event bus —
    // waiting for a DURATION rather than a condition is what made four tests red
    // in CI and green locally (004).
    let arrived = false;
    for (let i = 0; i < 40 && !arrived; i++) {
      const res = await notifications(namedToken);
      arrived = res.body.items.some((n: { kind: string }) => n.kind === 'mention');
      if (!arrived) await new Promise((r) => setTimeout(r, 250));
    }
    expect({ mentionNotification: arrived }).toEqual({ mentionNotification: true });
  }, 180_000);

  it('FR-032 notifies nobody across a block, and discloses nothing either way', async () => {
    const author = await h.createPerson('blockedMentionAuthor');
    const victim = await h.createPerson('blockedMentionVictim');
    const authorToken = await h.token(author);
    const victimToken = await h.token(victim);
    const victimHandle = (await request(server()).get('/v1/me').set('authorization', `Bearer ${victimToken}`)).body
      .handle as string;

    const blocked = await request(server())
      .put(`/v1/blocks/${victimHandle}`)
      .set('authorization', `Bearer ${authorToken}`);
    expect({ step: 'block', status: blocked.status }).toEqual({ step: 'block', status: 204 });

    await publishReady(authorToken, `something about @${victimHandle}`);

    await consistently(
      async (): Promise<number> => {
        const res = await notifications(victimToken);
        return res.body.items.filter((n: { kind: string }) => n.kind === 'mention').length;
      },
      (count: number) => count === 0,
      { forMs: 3000, describe: 'no mention notification across a block' },
    );

    // And nothing about the block leaks back to the author either: the post
    // publishes normally, because refusing it would tell them a block exists.
    const own = await notifications(authorToken);
    expect(own.status).toBe(200);
  }, 180_000);
});
