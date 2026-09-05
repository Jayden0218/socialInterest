import type { BlockRepository } from '../persistence/block.repository';
import type { PersonFollowRepository } from '../persistence/person-follow.repository';

/**
 * Per-request memo for the follow (A10) and block (A18) point reads. A feed page
 * can contain many posts by the same author; without this the filter would issue
 * one pair of reads per post instead of one pair per distinct author.
 *
 * Scope is a single request. Never make it longer-lived: FR-017 requires a
 * visibility-relevant change to take effect immediately, and a stale cached
 * follow or block would defeat that.
 */
export class RelationshipCache {
  private readonly follows = new Map<string, Promise<boolean>>();
  private readonly blocks = new Map<string, Promise<boolean>>();

  constructor(
    private readonly personFollows: PersonFollowRepository,
    private readonly blocksRepo: BlockRepository,
  ) {}

  isFollowing(viewerId: string, authorId: string): Promise<boolean> {
    const key = `${viewerId}>${authorId}`;
    let p = this.follows.get(key);
    if (!p) {
      p = this.personFollows.isFollowing(viewerId, authorId);
      this.follows.set(key, p);
    }
    return p;
  }

  isBlockedBetween(a: string, b: string): Promise<boolean> {
    // Unordered pair: a block hides content in both directions (FR-044).
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    let p = this.blocks.get(key);
    if (!p) {
      p = this.blocksRepo.existsBetween(a, b);
      this.blocks.set(key, p);
    }
    return p;
  }
}
