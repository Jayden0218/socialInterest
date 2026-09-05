import { FollowExpansion } from '../../src/modules/feed/follow-expansion';
import type { CatalogueSearch } from '../../src/modules/interests/catalogue.cache';
import type { InterestItem } from '../../src/persistence/interest.repository';

const interest = (over: Partial<InterestItem> & { interestId: string }): InterestItem => ({
  name: over.interestId,
  nameNormalised: over.interestId,
  slug: over.interestId,
  level: 'sub',
  createdBy: 'SYSTEM',
  postCount: 0,
  followerCount: 0,
  state: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
});

/** A catalogue with one parent (P) holding two children (C1, C2), plus a loner. */
const makeCatalogue = (items: InterestItem[]): CatalogueSearch => ({
  byId: (id) => items.find((i) => i.interestId === id),
  childrenOf: (parentId) =>
    items.filter((i) => (parentId === 'ROOT' ? i.level === 'top' : i.parentId === parentId)),
  search: () => [],
  findSimilar: () => [],
  size: () => items.length,
});

const BASE = [
  interest({ interestId: 'P', level: 'top' }),
  interest({ interestId: 'C1', parentId: 'P' }),
  interest({ interestId: 'C2', parentId: 'P' }),
  interest({ interestId: 'OTHER', level: 'top' }),
];

describe('FollowExpansion — FR-028', () => {
  const expansion = new FollowExpansion(makeCatalogue(BASE));

  it('following a top-level interest covers its sub-interests', () => {
    expect(expansion.expand(['P']).sort()).toEqual(['C1', 'C2', 'P']);
  });

  it('following a sub-interest covers only that one', () => {
    // Not the parent: following "film photography" must not pull in all of
    // Photography, or the follow means something different than it says.
    expect(expansion.expand(['C1'])).toEqual(['C1']);
  });

  it('does not leak into an unfollowed parent branch', () => {
    expect(expansion.expand(['P'])).not.toContain('OTHER');
  });

  it('de-duplicates when both a parent and its child are followed', () => {
    const out = expansion.expand(['P', 'C1']);
    expect(out.sort()).toEqual(['C1', 'C2', 'P']);
    expect(new Set(out).size).toBe(out.length);
  });

  it('covers a sub-interest CREATED AFTER the follow', () => {
    // The reason expansion happens at read time at all. With follow rows per
    // sub-interest, C3 would need back-filling into every follower of P, and
    // until that ran the follower would silently miss its posts.
    const later = makeCatalogue([...BASE, interest({ interestId: 'C3', parentId: 'P' })]);
    expect(new FollowExpansion(later).expand(['P'])).toContain('C3');
  });

  it('skips interests that are retired or merged', () => {
    const withDead = makeCatalogue([
      ...BASE,
      interest({ interestId: 'GONE', parentId: 'P', state: 'retired' }),
      interest({ interestId: 'MERGED', level: 'top', state: 'merged' }),
    ]);
    const out = new FollowExpansion(withDead).expand(['P', 'MERGED']);
    expect(out).not.toContain('GONE');
    expect(out).not.toContain('MERGED');
  });

  it('skips an interest that has vanished from the catalogue entirely', () => {
    expect(expansion.expand(['NOPE'])).toEqual([]);
  });

  it('covers() agrees with expand()', () => {
    for (const id of ['P', 'C1', 'C2']) {
      expect(expansion.covers(['P'], id)).toBe(true);
    }
    expect(expansion.covers(['P'], 'OTHER')).toBe(false);
    expect(expansion.covers(['C1'], 'C2')).toBe(false);
  });
});
