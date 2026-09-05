import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/problem.filter';
import { InterestFollowRepository } from '../../persistence/interest-follow.repository';
import { InterestRepository } from '../../persistence/interest.repository';
import { CATALOGUE_SEARCH, type CatalogueSearch } from './catalogue.cache';

/**
 * FR-027 follow/unfollow, with the cap from research D1.
 *
 * The cap exists because the feed is assembled at read time: every followed
 * interest is a query on the feed's critical path, and SC-005 gives that path a
 * 2s p95. 200 is the budget that assumption was made against - raising it
 * without re-running bench:feed puts SC-005 at risk.
 */
export const MAX_FOLLOWED_INTERESTS = 200;

@Injectable()
export class InterestFollowService {
  constructor(
    @Inject(InterestFollowRepository) private readonly follows: InterestFollowRepository,
    @Inject(InterestRepository) private readonly interests: InterestRepository,
    @Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch,
  ) {}

  /** Idempotent: following twice is following once. */
  async follow(userId: string, interestId: string): Promise<{ alreadyFollowing: boolean }> {
    const interest = this.catalogue.byId(interestId);
    if (!interest) throw new DomainError(HttpStatus.NOT_FOUND, 'No such interest');
    if (interest.state !== 'active') {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'Interest unavailable',
        `"${interest.name}" is ${interest.state}`,
      );
    }

    if (await this.follows.isFollowing(userId, interestId)) return { alreadyFollowing: true };

    const current = await this.follows.listFollowed(userId, MAX_FOLLOWED_INTERESTS + 1);
    if (current.length >= MAX_FOLLOWED_INTERESTS) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'Follow limit reached',
        `You can follow at most ${MAX_FOLLOWED_INTERESTS} interests. Unfollow one to make room.`,
      );
    }

    await this.follows.follow(userId, interestId);
    await this.interests.incrementFollowerCount(interestId, 1);
    return { alreadyFollowing: false };
  }

  /** Idempotent: unfollowing something you do not follow is a no-op. */
  async unfollow(userId: string, interestId: string): Promise<void> {
    if (!(await this.follows.isFollowing(userId, interestId))) return;
    await this.follows.unfollow(userId, interestId);
    await this.interests.incrementFollowerCount(interestId, -1);
  }

  async followedIds(userId: string): Promise<string[]> {
    return (await this.follows.listFollowed(userId)).map((f) => f.interestId);
  }

  /**
   * FR-029: what to follow when you follow little or nothing. Ranked by how
   * active an interest is, since an empty interest is a poor first follow.
   * SC-006 measures whether someone can find three relevant interests in
   * two minutes, so this is the onboarding path, not a nicety.
   */
  async suggest(userId: string, limit = 12): Promise<string[]> {
    const following = new Set(await this.followedIds(userId));
    return this.catalogue
      .childrenOf('ROOT')
      .filter((i) => i.state === 'active' && !following.has(i.interestId))
      .sort((a, b) => b.postCount - a.postCount || b.followerCount - a.followerCount)
      .slice(0, limit)
      .map((i) => i.interestId);
  }
}
