import type { BlockRepository } from '../persistence/block.repository';
import type { PersonFollowRepository } from '../persistence/person-follow.repository';
import type { PersonRepository } from '../persistence/person.repository';

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
  private readonly privacy = new Map<string, Promise<boolean>>();

  constructor(
    private readonly personFollows: PersonFollowRepository,
    private readonly blocksRepo: BlockRepository,
    private readonly people: PersonRepository,
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

  /**
   * 008/FR-043, FR-044 — IS THIS AUTHOR'S ACCOUNT PRIVATE?
   *
   * READ HERE RATHER THAN CARRIED ON THE CANDIDATE, and the difference matters.
   *
   * Privacy is a property of the AUTHOR, not of the post, so a candidate row
   * cannot carry it without either denormalising it into every index item — a
   * flip would then need a re-index, which FR-044 and 001/FR-017 forbid — or
   * making all thirteen post surfaces populate a field, where the cost of
   * forgetting one is that a private account's posts stay public on it. That is
   * the "declared half with no other half" failure this whole feature exists to
   * end, in the one place where its consequence is a privacy leak.
   *
   * Resolved inside the boundary instead: no surface can forget, and the flip
   * lands everywhere on the next read because the boundary runs per request.
   * Memoised per request like the follow and block reads, and consulted only
   * where it can change the answer (a `public` post, a viewer who is not the
   * author), so an open account costs one point read per distinct author.
   */
  isPrivateAccount(authorId: string): Promise<boolean> {
    let p = this.privacy.get(authorId);
    if (!p) {
      p = this.people
        .findById(authorId)
        // Absent means `open` — every account written before 008 keeps working.
        .then((person) => person?.accountPrivacy === 'private')
        /*
         * A read that fails must not OPEN a private account. Failing closed on a
         * public post costs a hidden post; failing open costs the guarantee.
         */
        .catch(() => true);
      this.privacy.set(authorId, p);
    }
    return p;
  }
}
