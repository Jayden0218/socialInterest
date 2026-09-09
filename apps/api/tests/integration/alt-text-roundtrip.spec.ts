import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';

/**
 * 008/T140, US10 — FR-034, FR-036. SET AT PUBLISH, RETURNED ON READ, EDITABLE.
 *
 * The description belongs to the MEDIA ITEM and not to the post, because a post
 * carries up to ten photographs and one sentence cannot describe ten pictures.
 * That is the whole design decision, and this test is what makes it visible:
 * two images, two different descriptions, both surviving a round trip.
 */
describe('008/US10 alt text survives publish, read and edit', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

  /**
   * `altTexts` is a MAP KEYED BY UPLOAD ID, not a parallel array.
   *
   * A second list aligned by index is two lists for one thing, which this
   * project keeps recording as the mechanism of drift rather than a risk of it
   * (004's two category lists, 007's `theme.font`). `uploadIds` is unchanged,
   * so every existing caller and the 002 contract fix stand.
   */
  const oneImage = async (token: string, altText: string) => {
    const uploadId = await h.uploadId(token);
    return {
      uploadIds: [uploadId],
      altTexts: { [uploadId]: altText },
      interestIds: [await h.topInterestId()],
      visibility: 'public' as const,
    };
  };

  it('FR-034 carries a description PER IMAGE, and returns both', async () => {
    const author = await h.createPerson('altAuthor');
    const token = await h.token(author);

    const created = await request(server())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send(await (async () => {
        const first = await h.uploadId(token);
        const second = await h.uploadId(token);
        return {
          uploadIds: [first, second],
          altTexts: {
            [first]: 'A grey cat asleep on a windowsill',
            [second]: 'The same cat, awake and unimpressed',
          },
          interestIds: [await h.topInterestId()],
          caption: 'two of the same cat',
          visibility: 'public' as const,
        };
      })());
    expect({ step: 'publish', status: created.status, body: created.body }).toEqual({
      step: 'publish',
      status: 201,
      body: created.body,
    });
    const postId = created.body.postId as string;

    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);

    const read = await request(server()).get(`/v1/posts/${postId}`).set('authorization', `Bearer ${token}`);
    expect(read.status).toBe(200);
    expect(read.body.media.map((m: { altText: string | null }) => m.altText)).toEqual([
      'A grey cat asleep on a windowsill',
      'The same cat, awake and unimpressed',
    ]);
  }, 180_000);

  it('FR-036 is editable wherever the post is, one item at a time', async () => {
    const author = await h.createPerson('altEditor');
    const token = await h.token(author);

    const created = await request(server())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send(await oneImage(token, 'A first attempt'));
    expect(created.status).toBe(201);
    const postId = created.body.postId as string;
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);

    const edited = await request(server())
      .patch(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${token}`)
      .send({ media: [{ ordinal: 0, altText: 'A better description of the same picture' }] });
    expect(edited.status).toBe(200);

    const read = await request(server()).get(`/v1/posts/${postId}`).set('authorization', `Bearer ${token}`);
    expect(read.body.media[0].altText).toBe('A better description of the same picture');
  }, 180_000);

  it('refuses a description longer than the limit rather than truncating it', async () => {
    const author = await h.createPerson('altTooLong');
    const token = await h.token(author);
    const created = await request(server())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send(await oneImage(token, 'x'.repeat(301)));
    // Truncating would publish a sentence the author did not write, on the one
    // field whose whole job is to say what the picture shows.
    expect(created.status).toBe(422);
  }, 120_000);
});
