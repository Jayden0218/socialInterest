import { actor } from '../support/client';

/**
 * 004/US4. People are searchable (FR-034), and the search does not become a way
 * around a block (FR-035) or a way to find a deleted account (FR-036).
 */
describe('004/US4 - finding a person', () => {
  it('FR-034 finds a person by a handle prefix', async () => {
    const searcher = await actor('findme');
    const target = await actor('findme');
    const prefix = target.handle.slice(0, 8);

    const results = await searcher.data.people.search(prefix, { limit: 25 });
    expect(results.items.map((p) => p.handle)).toContain(target.handle);
  });

  it('FR-034 finds a person by display name, in any casing', async () => {
    const searcher = await actor('namesearcher');
    const target = await actor('nametarget');
    const name = `Zaphod ${Date.now().toString(36)}`;
    await target.data.session.updateProfile({ displayName: name });

    // Upper-cased on purpose: the stored copy is lowercase and DynamoDB's
    // `contains` is case-sensitive, so this fails against a naive match.
    const results = await searcher.data.people.search(name.toUpperCase(), { limit: 25 });
    expect(results.items.map((p) => p.handle)).toContain(target.handle);
  }, 60_000);

  it('FR-034 a renamed person is findable under the NEW name, not the old one', async () => {
    const searcher = await actor('renamesearcher');
    const target = await actor('renametarget');
    const before = `Before${Date.now().toString(36)}`;
    const after = `After${Date.now().toString(36)}`;

    await target.data.session.updateProfile({ displayName: before });
    await target.data.session.updateProfile({ displayName: after });

    expect((await searcher.data.people.search(after, { limit: 25 })).items.map((p) => p.handle)).toContain(
      target.handle,
    );
    expect(
      (await searcher.data.people.search(before, { limit: 25 })).items.map((p) => p.handle),
    ).not.toContain(target.handle);
  }, 60_000);

  /**
   * SC-012, BOTH DIRECTIONS.
   *
   * 001/FR-044 hides content in both directions, and a search result is content
   * about a person. Testing one direction is the easy mistake - and the
   * direction usually tested is the one where the searcher did the blocking,
   * which is the less dangerous of the two.
   */
  it('SC-012 somebody I blocked does not appear in my results', async () => {
    const searcher = await actor('blockerSearcher');
    const target = await actor('blockedTarget');
    const prefix = target.handle.slice(0, 8);
    expect((await searcher.data.people.search(prefix, { limit: 25 })).items.map((p) => p.handle)).toContain(
      target.handle,
    );

    await searcher.data.safety.block(target.handle);
    expect(
      (await searcher.data.people.search(prefix, { limit: 25 })).items.map((p) => p.handle),
    ).not.toContain(target.handle);
  }, 60_000);

  it('SC-012 somebody who blocked ME does not appear in my results either', async () => {
    const searcher = await actor('blockedSearcher');
    const target = await actor('blockerTarget');
    const prefix = target.handle.slice(0, 8);
    expect((await searcher.data.people.search(prefix, { limit: 25 })).items.map((p) => p.handle)).toContain(
      target.handle,
    );

    // THEY block ME. The searcher took no action and must still not see them.
    await target.data.safety.block(searcher.handle);
    expect(
      (await searcher.data.people.search(prefix, { limit: 25 })).items.map((p) => p.handle),
    ).not.toContain(target.handle);
  }, 60_000);

  it('FR-036 a deleted account is not findable', async () => {
    const searcher = await actor('deletedSearcher');
    const target = await actor('deletedTarget');
    const prefix = target.handle.slice(0, 8);
    expect((await searcher.data.people.search(prefix, { limit: 25 })).items.map((p) => p.handle)).toContain(
      target.handle,
    );

    await target.data.session.deleteAccount();
    expect(
      (await searcher.data.people.search(prefix, { limit: 25 })).items.map((p) => p.handle),
    ).not.toContain(target.handle);
  }, 60_000);

  it('FR-034 you do not find yourself', async () => {
    const me = await actor('selfsearch');
    const results = await me.data.people.search(me.handle.slice(0, 8), { limit: 25 });
    expect(results.items.map((p) => p.handle)).not.toContain(me.handle);
  });
});
