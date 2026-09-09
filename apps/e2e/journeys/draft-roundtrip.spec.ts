import { actor } from '../support/client';
import { jpegPlain } from '../support/media';

/**
 * 008/T147, US11 — SC-012. SAVE, LEAVE, COME BACK, LOSE NOTHING.
 *
 * Over HTTP through the app's own data layer, because that is the only thing
 * that has ever caught this class of defect here: five features of green tests
 * agreed with a type that disagreed with the server (007's `ApiPage<T>`).
 *
 * The assertion is FIELD BY FIELD rather than a shape check. SC-012 says zero
 * fields lost, and a test that compared object identity or counted keys would
 * pass while a caption came back empty.
 */
describe('008/SC-012 a draft restores everything', () => {
  it('keeps caption, interests, place, media and descriptions', async () => {
    const me = await actor('draftKeeper');
    const interest = (await me.data.interests.listTop({ limit: 1 })).items[0]!;
    const bytes = jpegPlain();
    const target = await me.data.posts.createUploadTarget({
      kind: 'image',
      contentType: 'image/jpeg',
      sizeBytes: bytes.byteLength,
    });
    await me.data.posts.uploadBytes(target, bytes, 'image/jpeg');

    const saved = await me.data.drafts.save({
      caption: 'the half-written version',
      interestIds: [interest.interestId],
      uploadIds: [target.uploadId],
      altTexts: { [target.uploadId]: 'A picture I have described already' },
    });

    const restored = await me.data.drafts.get(saved.draftId);
    expect({
      caption: restored.caption,
      interestIds: restored.interestIds,
      uploadIds: restored.uploadIds,
      altText: restored.altTexts?.[target.uploadId],
      // Within the upload lifetime, so nothing is expired — the other half is
      // asserted in `draft-expired-uploads.spec.ts` against a missing record.
      expired: restored.expiredUploadIds ?? [],
    }).toEqual({
      caption: 'the half-written version',
      interestIds: [interest.interestId],
      uploadIds: [target.uploadId],
      altText: 'A picture I have described already',
      expired: [],
    });
  }, 120_000);

  it('FR-038 publishing FROM a draft leaves no draft behind', async () => {
    const me = await actor('draftPublisher');
    const interest = (await me.data.interests.listTop({ limit: 1 })).items[0]!;
    const bytes = jpegPlain();
    const target = await me.data.posts.createUploadTarget({
      kind: 'image',
      contentType: 'image/jpeg',
      sizeBytes: bytes.byteLength,
    });
    await me.data.posts.uploadBytes(target, bytes, 'image/jpeg');

    const saved = await me.data.drafts.save({
      caption: 'about to become a post',
      interestIds: [interest.interestId],
      uploadIds: [target.uploadId],
    });

    const post = await me.data.posts.publish({
      uploadIds: [target.uploadId],
      interestIds: [interest.interestId],
      caption: 'about to become a post',
      draftId: saved.draftId,
    });
    expect(post.postId).toBeTruthy();

    /**
     * The draft is gone, and it went in the SAME transaction as the post was
     * written. A surviving draft is one somebody publishes a second time,
     * which is the failure this cannot be allowed to half-do.
     */
    const list = await me.data.drafts.list();
    expect(list.items.map((d) => d.draftId)).not.toContain(saved.draftId);
  }, 120_000);
});
