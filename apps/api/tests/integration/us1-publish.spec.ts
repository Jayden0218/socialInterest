import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { MEDIA_LIMITS } from '../../src/config/media.limits';

/**
 * US1 acceptance scenarios, driven through HTTP against DynamoDB Local + MinIO.
 * Numbering follows spec.md § User Story 1.
 */
describe('US1 — publish media to an interest', () => {
  let h: Harness;
  let authorId: string;
  let token: string;
  let interestId: string;

  beforeAll(async () => {
    h = await bootHarness();
    authorId = await h.createPerson('author');
    token = await h.token(authorId);
    interestId = await h.topInterestId();
  }, 60_000);

  afterAll(async () => h?.close());

  const upload = async (body: Record<string, unknown>) =>
    request(h.app.getHttpServer())
      .post('/v1/media/uploads')
      .set('authorization', `Bearer ${token}`)
      .send(body);

  const publish = async (body: Record<string, unknown>) =>
    request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send(body);

  it('scenario 1: publishing an image to an interest returns a post filed under it', async () => {
    const target = await upload({ kind: 'image', contentType: 'image/jpeg', sizeBytes: 1024 });
    expect(target.status).toBe(201);
    expect(target.body.url).toContain('http');

    const res = await publish({
      uploads: [{ uploadId: target.body.uploadId, key: `uploads/${authorId}/x`, kind: 'image' }],
      interestIds: [interestId],
      caption: 'first post',
    });
    expect(res.status).toBe(201);
    expect(res.body.interestIds).toEqual([interestId]);
    expect(res.body.mediaKind).toBe('images');
  });

  it('scenario 2: a video within the caps is accepted and starts processing', async () => {
    const target = await upload({
      kind: 'video',
      contentType: 'video/mp4',
      sizeBytes: 5_000_000,
      durationMs: 30_000,
    });
    expect(target.status).toBe(201);

    const res = await publish({
      uploads: [{ uploadId: target.body.uploadId, key: `uploads/${authorId}/v`, kind: 'video', durationMs: 30_000 }],
      interestIds: [interestId],
    });
    expect(res.status).toBe(201);
    expect(res.body.mediaKind).toBe('video');
    // Not visible to others until derivation completes.
    expect(res.body.processingState).toBe('pending');
  });

  it('scenario 3: publishing without an interest is refused (FR-006)', async () => {
    const res = await publish({
      uploads: [{ uploadId: 'u1', key: 'k', kind: 'image' }],
      interestIds: [],
    });
    expect(res.status).toBe(422);
    expect(res.body.title).toBe('Validation failed');
  });

  it('scenario 4: publishing without touching visibility yields a PUBLIC post (FR-013)', async () => {
    const res = await publish({
      uploads: [{ uploadId: 'u2', key: 'k', kind: 'image' }],
      interestIds: [interestId],
    });
    expect(res.status).toBe(201);
    expect(res.body.visibility).toBe('public');
  });

  it('scenario 5: followers-only is recorded as chosen', async () => {
    const res = await publish({
      uploads: [{ uploadId: 'u3', key: 'k', kind: 'image' }],
      interestIds: [interestId],
      visibility: 'followers',
    });
    expect(res.status).toBe(201);
    expect(res.body.visibility).toBe('followers');
  });

  it('scenario 6: a cap is reported BEFORE any bytes move (FR-005)', async () => {
    // The point of the requirement: the caller learns of the limit up front,
    // not after a long upload. So the refusal comes from /media/uploads.
    const tooLong = await upload({
      kind: 'video',
      contentType: 'video/mp4',
      sizeBytes: 1000,
      durationMs: MEDIA_LIMITS.video.maxDurationMs + 1,
    });
    expect(tooLong.status).toBe(413);
    expect(tooLong.body.title).toBe('Video too long');

    const tooBig = await upload({
      kind: 'image',
      contentType: 'image/jpeg',
      sizeBytes: MEDIA_LIMITS.image.maxBytes + 1,
    });
    expect(tooBig.status).toBe(413);

    const wrongType = await upload({
      kind: 'image',
      contentType: 'application/pdf',
      sizeBytes: 1000,
    });
    expect(wrongType.status).toBe(415);

    const noDuration = await upload({ kind: 'video', contentType: 'video/mp4', sizeBytes: 1000 });
    expect(noDuration.status).toBe(422);
  });

  it('requires authentication to publish', async () => {
    const res = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .send({ uploads: [{ uploadId: 'u', key: 'k', kind: 'image' }], interestIds: [interestId] });
    expect(res.status).toBe(401);
  });
});

/**
 * Acceptance scenario 1, completed: "the post is visible in that interest's
 * space and on their own profile". Publishing is only half the scenario.
 */
describe('US1 — a published post appears on both surfaces', () => {
  let h: Harness;
  let authorId: string;
  let handle: string;
  let token: string;
  let interestId: string;

  beforeAll(async () => {
    h = await bootHarness();
    authorId = await h.createPerson('surfaces');
    token = await h.token(authorId);
    interestId = await h.topInterestId();
    const people = h.module.get(
      (await import('../../src/persistence/person.repository')).PersonRepository,
    );
    handle = (await people.findById(authorId))!.handle;
  }, 60_000);

  afterAll(async () => h?.close());

  const publish = (body: Record<string, unknown>) =>
    request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send(body);

  it('a public, ready post is visible to a signed-out viewer on both surfaces', async () => {
    const created = await publish({
      uploads: [{ uploadId: 'u', key: 'k', kind: 'image' }],
      interestIds: [interestId],
      caption: 'visible everywhere',
    });
    expect(created.status).toBe(201);
    const postId = created.body.postId as string;

    // Posts start `pending`, so nobody but the author sees them yet - the
    // invariant FR-009 and the processing aggregation exist to enforce.
    const beforeReady = await request(h.app.getHttpServer()).get(`/v1/interests/${interestId}/posts`);
    expect(beforeReady.body.items.map((i: { postId: string }) => i.postId)).not.toContain(postId);

    // Mark it ready the way the worker would, via the transactional path that
    // keeps the denormalised index items in step.
    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);

    const inInterest = await request(h.app.getHttpServer()).get(`/v1/interests/${interestId}/posts`);
    expect(inInterest.status).toBe(200);
    expect(inInterest.body.items.map((i: { postId: string }) => i.postId)).toContain(postId);

    const onProfile = await request(h.app.getHttpServer()).get(`/v1/people/${handle}/posts`);
    expect(onProfile.status).toBe(200);
    expect(onProfile.body.items.map((i: { postId: string }) => i.postId)).toContain(postId);
  }, 60_000);

  it('a private post is hidden on both surfaces but visible to its author (SC-009)', async () => {
    const created = await publish({
      uploads: [{ uploadId: 'u', key: 'k', kind: 'image' }],
      interestIds: [interestId],
      visibility: 'private',
    });
    const postId = created.body.postId as string;

    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);

    const anonInterest = await request(h.app.getHttpServer()).get(`/v1/interests/${interestId}/posts`);
    expect(anonInterest.body.items.map((i: { postId: string }) => i.postId)).not.toContain(postId);

    const anonProfile = await request(h.app.getHttpServer()).get(`/v1/people/${handle}/posts`);
    expect(anonProfile.body.items.map((i: { postId: string }) => i.postId)).not.toContain(postId);

    // 403, not 404: it exists, it is just not for this viewer (FR-042).
    const anonDirect = await request(h.app.getHttpServer()).get(`/v1/posts/${postId}`);
    expect(anonDirect.status).toBe(403);

    const asAuthor = await request(h.app.getHttpServer())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${token}`);
    expect(asAuthor.status).toBe(200);
  }, 60_000);

  it('an unknown post is 404, never 403 (FR-042)', async () => {
    const res = await request(h.app.getHttpServer()).get('/v1/posts/01JXXXXXXXXXXXXXXXXXXXXXXX');
    expect(res.status).toBe(404);
  });
});
