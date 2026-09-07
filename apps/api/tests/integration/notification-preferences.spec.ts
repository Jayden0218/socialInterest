import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { NotificationRepository } from '../../src/persistence/notification.repository';
import { eventually } from './eventually';

/**
 * 001/FR-049 and 004/FR-031, asserted where it actually matters.
 *
 * ENFORCEMENT IS AT CREATION, NOT AT READ. The suppressed notification is never
 * WRITTEN, so this reads the repository directly rather than the list endpoint:
 * a row that exists and is filtered out on one path leaks through every other
 * reader - a digest, a badge count, a push sender, an export - and the list
 * endpoint would look identical either way.
 *
 * All four categories, because three of them shipped in 001 and only `message`
 * is new. If one of the three regresses while adding the fourth, that is the
 * finding.
 */
describe('notification preferences are enforced at creation (FR-049, FR-031)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const CATEGORIES = ['reaction', 'comment', 'follow', 'message'] as const;

  const newPerson = async (handle: string): Promise<string> => h.token(await h.createPerson(handle));

  /** Publishes and drives the post to `ready`, deterministically. */
  const publishReady = async (token: string): Promise<string> => {
    const created = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({ uploadIds: [await h.uploadId(token)], interestIds: [await h.topInterestId()] });
    const postId = created.body.postId as string;
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);
    return postId;
  };

  it('every category can be turned off independently, and the others survive', async () => {
    for (const off of CATEGORIES) {
      const token = await newPerson(`prefs${off}`);
      const patched = await request(h.app.getHttpServer())
        .patch('/v1/me')
        .set('authorization', `Bearer ${token}`)
        .send({ notificationPrefs: { [off]: false } });
      expect(patched.status).toBe(200);

      // The one asked for is off; the other three are untouched. A patch that
      // replaced rather than merged would silently disable everything.
      expect({ off, value: patched.body.notificationPrefs[off] }).toEqual({ off, value: false });
      for (const other of CATEGORIES.filter((c) => c !== off)) {
        expect({ off, other, value: patched.body.notificationPrefs[other] }).toEqual({
          off,
          other,
          value: true,
        });
      }
    }
  }, 120_000);

  it('a reaction to a post writes ZERO rows when reactions are off', async () => {
    const authorToken = await newPerson('prefsauthor');
    const fanToken = await newPerson('prefsfan');

    await request(h.app.getHttpServer())
      .patch('/v1/me')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ notificationPrefs: { reaction: false } });

    const me = await request(h.app.getHttpServer()).get('/v1/me').set('authorization', `Bearer ${authorToken}`);
    const postId = await publishReady(authorToken);

    await request(h.app.getHttpServer())
      .put(`/v1/posts/${postId}/reaction`)
      .set('authorization', `Bearer ${fanToken}`);

    const notifications = h.module.get(NotificationRepository);

    // A comment from the SAME person proves the pipeline is alive - otherwise
    // "zero reaction notifications" passes just as well against a broken
    // notifier, which is the trivially-green version of this test.
    await request(h.app.getHttpServer())
      .post(`/v1/posts/${postId}/comments`)
      .set('authorization', `Bearer ${fanToken}`)
      .send({ body: 'this one should notify' });

    const page = await eventually(
      () => notifications.list(me.body.userId as string, { limit: 50 }),
      (p) => p.items.some((n) => n.kind === 'comment'),
      { describe: 'the comment notification, proving the notifier runs at all' },
    );

    expect(page.items.filter((n) => n.kind === 'reaction')).toHaveLength(0);
  }, 180_000);
});
