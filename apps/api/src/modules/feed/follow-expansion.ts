import { Inject, Injectable } from '@nestjs/common';
import { CATALOGUE_SEARCH, type CatalogueSearch } from '../interests/catalogue.cache';

/**
 * FR-028: following a top-level interest covers all of its sub-interests.
 *
 * Expanded AT READ TIME against the catalogue, not by writing a follow row per
 * sub-interest. That choice is the whole point: a sub-interest created AFTER the
 * follow is covered immediately, with no back-fill job and no window during
 * which the follower silently misses posts. Writing rows would mean every new
 * sub-interest had to fan out to every follower of its parent - unbounded work
 * on a write that should be trivial.
 *
 * The cost is that the expansion runs on every feed read, which is why the
 * catalogue lives in memory (research D3) and the follow count is capped (D1).
 */
@Injectable()
export class FollowExpansion {
  constructor(@Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch) {}

  /**
   * Turns the interests a person follows into the set of interest partitions
   * their feed must read. Following a parent yields the parent plus its current
   * children; following a sub-interest yields just that one.
   */
  expand(followedInterestIds: readonly string[]): string[] {
    const expanded = new Set<string>();
    for (const id of followedInterestIds) {
      const interest = this.catalogue.byId(id);
      // A retired or merged interest is absent from the cache; skip it rather
      // than querying a partition that can no longer receive posts.
      if (!interest || interest.state !== 'active') continue;

      expanded.add(id);
      if (interest.level === 'top') {
        for (const child of this.catalogue.childrenOf(id)) {
          if (child.state === 'active') expanded.add(child.interestId);
        }
      }
    }
    return [...expanded];
  }

  /**
   * Whether a specific interest is covered by a follow set - the same rule the
   * feed uses, exposed so callers do not re-derive it.
   */
  covers(followedInterestIds: readonly string[], interestId: string): boolean {
    if (followedInterestIds.includes(interestId)) return true;
    const interest = this.catalogue.byId(interestId);
    return interest?.parentId ? followedInterestIds.includes(interest.parentId) : false;
  }
}
