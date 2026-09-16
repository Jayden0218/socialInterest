import { InMemoryCatalogueCache } from '../../src/modules/interests/catalogue.cache';
import type { InterestItem } from '../../src/persistence/interest.repository';

/**
 * 013/T009, FR-008, SC-005. THE DUPLICATE GATE MUST SEE THE WHOLE CATALOGUE.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THIS IS THE DEFECT THAT WOULD HAVE SHIPPED IN SILENCE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `findSimilar(name, parentId)` read `byParent.get(parentId)`. That was nearly
 * right while every interest had a parent from a catalogue of twelve. With flat
 * interests there IS no parent, so the candidate list comes back EMPTY,
 * `isTooSimilar([])` is false, and every proposed name is accepted as new.
 *
 * Nothing errors. No request fails. No other test goes red. The single most
 * effective control against sprawl simply stops having an opinion, at exactly
 * the moment it starts to matter — which is the shape CLAUDE.md records as "a
 * guard can lose its subject and pass", after `hooks-before-return.test.ts`
 * reported zero offenders over a barrel of re-exports in the same run that
 * claimed 253 passing tests.
 *
 * So this test was written FIRST and watched RED against the sibling-scoped
 * implementation. A guard that has only ever passed says nothing about a guard
 * whose subject can vanish.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THE CASE IS CONSTRUCTED THE WAY IT IS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The two interests are deliberately NOT siblings. A sibling-scoped
 * implementation finds them and passes; only a global one does. If this test
 * ever stops distinguishing the two implementations it has stopped testing
 * anything, which is why the fixture carries no shared parent at all.
 */
const interest = (interestId: string, name: string): InterestItem => ({
  interestId,
  name,
  nameNormalised: name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  createdBy: 'u1',
  postCount: 1,
  followerCount: 0,
  state: 'active',
  createdAt: new Date().toISOString(),
});

/**
 * Loaded through `refresh()` against a stub repository, NOT through a
 * test-only `load()` on the cache.
 *
 * 011 named the distinction while resisting the same shortcut: "a production
 * class carrying `countHandleHoldersForTests` is a test affordance one refactor
 * away from being mistaken for the product path". The cache builds its indexes
 * inside `refresh()`, so driving that is also the only way to be sure this test
 * exercises the same code a running process does.
 */
const cacheOf = async (...items: InterestItem[]): Promise<InMemoryCatalogueCache> => {
  const cache = new InMemoryCatalogueCache({ loadAll: async () => items } as never);
  await cache.refresh();
  return cache;
};

describe('013/SC-005 — the duplicate gate considers every interest', () => {
  it('finds a near-duplicate that shares no parent with the proposal', async () => {
    const cache = await cacheOf(interest('i1', 'Bouldering'), interest('i2', 'Birdwatching'));

    const matches = cache.findSimilar('bolderng');

    expect(matches.map((m) => m.interest.name)).toContain('Bouldering');
  });

  it('does not drag in genuinely different interests', async () => {
    const cache = await cacheOf(interest('i1', 'Bouldering'), interest('i2', 'Birdwatching'));

    // 0.333 on the measured scale in catalogue.search.ts. Blocking these would
    // be the worse failure: people stop creating interests at all.
    expect(cache.findSimilar('Birdwatching').map((m) => m.interest.name)).not.toContain('Bouldering');
  });
});
