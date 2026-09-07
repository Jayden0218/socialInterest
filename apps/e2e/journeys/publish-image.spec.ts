import { actor } from '../support/client';
import { jpegPlain } from '../support/media';

describe('core journeys - publish image', () => {
  it('J-04 presigns, uploads and publishes an image post', async () => {
    const me = await actor('imgauthor');
    const interest = (await me.data.interests.listTop({ limit: 1 })).items[0]!;
    const bytes = jpegPlain();

    // 1. Caps are checked here, before any bytes move (FR-005).
    const target = await me.data.posts.createUploadTarget({
      kind: 'image',
      contentType: 'image/jpeg',
      sizeBytes: bytes.byteLength,
    });
    expect(target.uploadId).toBeTruthy();
    expect(target.url).toContain('http');

    // 2. The bytes really go to the object store.
    await me.data.posts.uploadBytes(target, bytes, 'image/jpeg');

    // 3. Publish quotes the id only; the server knows the rest.
    const post = await me.data.posts.publish({
      uploadIds: [target.uploadId],
      interestIds: [interest.interestId],
      caption: 'first real end-to-end post',
    });

    expect(post.postId).toBeTruthy();
    expect(post.mediaKind).toBe('images');

    const readBack = await me.data.posts.get(post.postId);
    expect(readBack.postId).toBe(post.postId);
    expect(readBack.caption).toBe('first real end-to-end post');
  });

  it('J-04 refuses an oversized image before the upload starts (FR-005)', async () => {
    const me = await actor('imgcap');
    await expect(
      me.data.posts.createUploadTarget({
        kind: 'image',
        contentType: 'image/jpeg',
        sizeBytes: 500 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ status: 413 });
  });
});
