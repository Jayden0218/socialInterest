import { actor } from '../support/client';
import { jpegPlain } from '../support/media';
import { publishReadyImage } from '../support/publish';
import { eventually } from '../support/eventually';

/**
 * 008/T070, US5 — SC-008: AN AVATAR APPEARS ON 100% OF SURFACES SHOWING THAT
 * PERSON, AND IS ACTUALLY FETCHABLE.
 *
 * Before this feature `avatarUrl` was emitted on exactly ONE of seven profile
 * projections, and there it was `avatarUrl: p.avatarKey` — THE RAW STORAGE KEY,
 * which a private bucket answers 403 to. `avatarKey` had no writer at all.
 *
 * So the assertion that matters is not "the field is a string". A string was
 * always what shipped. **It is FETCHED**: 006 spent five features during which
 * every image in the app 403'd, because `MinioObjectStore.publicUrl` returned an
 * unsigned url for a private bucket and nothing had ever asked for the bytes.
 */
describe('008/SC-008 the avatar reaches every surface', () => {
  it('is present and fetchable on all seven profile-bearing responses', async () => {
    const me = await actor('avatarMe');
    const friend = await actor('avatarFriend');
    const interest = (await me.data.interests.listTop({ limit: 1 })).items[0]!;

    /**
     * Through the app's own data layer and the real upload path.
     *
     * BOTH people get one, and the friend's is not decoration: the notification
     * surface projects the ACTOR, who is the friend rather than the caller. The
     * first version of this test gave only `me` an avatar and then asserted the
     * notification actor had one — it failed on the friend's correct `null`,
     * which is the product working and the fixture being wrong.
     */
    const setAvatar = async (who: typeof me): Promise<string> => {
      const bytes = jpegPlain();
      const target = await who.data.posts.createUploadTarget({
        kind: 'avatar',
        contentType: 'image/jpeg',
        sizeBytes: bytes.byteLength,
      });
      await who.data.posts.uploadBytes(target, bytes, 'image/jpeg');
      const updated = await who.data.session.updateProfile({ avatarUploadId: target.uploadId });
      expect(typeof updated.avatarUrl).toBe('string');
      return updated.avatarUrl as string;
    };
    await setAvatar(me);
    await setAvatar(friend);

    const postId = await publishReadyImage(me, [interest.interestId], { caption: 'with a face' });
    await me.data.engagement.comment(postId, 'my own comment');
    await friend.data.people.follow(me.handle);
    const conversation = await friend.data.conversations.open(me.handle);
    await friend.data.conversations.send(conversation.conversationId, { body: 'hello' });

    /** Every surface, and the url each one carries for THIS person. */
    const surfaces: { name: string; url: () => Promise<unknown> }[] = [
      { name: 'own profile (GET /me)', url: async () => (await me.data.session.me()).avatarUrl },
      {
        name: 'another profile (GET /people/:handle)',
        url: async () => (await friend.data.people.get(me.handle)).avatarUrl,
      },
      {
        name: 'people search',
        url: async () =>
          (await friend.data.people.search(me.handle.slice(0, 6), { limit: 5 })).items.find(
            (p) => p.handle === me.handle,
          )?.avatarUrl,
      },
      {
        name: 'post author',
        url: async () => (await friend.data.posts.get(postId)).author.avatarUrl,
      },
      {
        name: 'comment author',
        url: async () =>
          (await friend.data.engagement.comments(postId, {})).items[0]?.author.avatarUrl,
      },
      {
        name: 'notification actor',
        url: async () => {
          const page = await eventually(
            () => me.data.notifications.list({ limit: 20 }),
            (p) => p.items.length > 0,
            { timeoutMs: 15_000, describe: 'a notification' },
          );
          // The ACTOR is the friend, not me - so this surface proves the
          // projection reaches a person other than the caller.
          return page.items[0]?.actor.avatarUrl;
        },
      },
      {
        name: 'conversation participant',
        url: async () =>
          (await friend.data.conversations.get(conversation.conversationId)).other?.avatarUrl,
      },
    ];

    for (const surface of surfaces) {
      const url = await surface.url();
      expect({ surface: surface.name, isString: typeof url === 'string' })
        .toEqual({ surface: surface.name, isString: true });

      /**
       * THE ASSERTION THE SHIPPED CODE WOULD HAVE FAILED.
       *
       * A raw storage key is a string too. Only fetching it tells the two apart,
       * and a private bucket answers 403 to the key.
       */
      const res = await fetch(url as string);
      expect({ surface: surface.name, status: res.status })
        .toEqual({ surface: surface.name, status: 200 });
    }
  }, 300_000);

  it('FR-019 a person with no avatar sends null, not a broken url', async () => {
    const faceless = await actor('avatarNone');
    const viewer = await actor('avatarNoneViewer');
    // Null rather than absent or an empty string: the client renders the derived
    // initial, and an empty string would be an <Image> pointed at nothing.
    expect((await viewer.data.people.get(faceless.handle)).avatarUrl ?? null).toBeNull();
    expect((await faceless.data.session.me()).avatarUrl ?? null).toBeNull();
  }, 120_000);
});
