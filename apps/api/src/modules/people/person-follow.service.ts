import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/problem.filter';
import { BlockRepository } from '../../persistence/block.repository';
import { PersonFollowRepository } from '../../persistence/person-follow.repository';
import { PersonRepository } from '../../persistence/person.repository';

/**
 * FR-037 person following.
 *
 * Following someone does NOT widen their feed - see FR-033 in FeedService. This
 * service only records the relationship; what it grants is decided at read time
 * in two places: the visibility filter (followers-only posts) and the feed's
 * intersection rule (prominence within followed interests only).
 */
@Injectable()
export class PersonFollowService {
  constructor(
    @Inject(PersonFollowRepository) private readonly follows: PersonFollowRepository,
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(BlockRepository) private readonly blocks: BlockRepository,
  ) {}

  async follow(followerId: string, followeeHandle: string): Promise<{ alreadyFollowing: boolean }> {
    const followee = await this.requirePerson(followeeHandle);
    if (followee.userId === followerId) {
      throw new DomainError(HttpStatus.CONFLICT, 'You cannot follow yourself');
    }

    // FR-044: a block in EITHER direction prevents the follow. Checking one
    // direction would let a blocked person re-establish the relationship.
    if (await this.blocks.existsBetween(followerId, followee.userId)) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'Not available',
        'This account cannot be followed.',
      );
    }

    if (await this.follows.isFollowing(followerId, followee.userId)) {
      return { alreadyFollowing: true };
    }

    await this.follows.follow(followerId, followee.userId);
    await Promise.all([
      this.people.incrementCounter(followee.userId, 'followerCount', 1),
      this.people.incrementCounter(followerId, 'followingCount', 1),
    ]);
    return { alreadyFollowing: false };
  }

  async unfollow(followerId: string, followeeHandle: string): Promise<void> {
    const followee = await this.requirePerson(followeeHandle);
    if (!(await this.follows.isFollowing(followerId, followee.userId))) return;
    await this.follows.unfollow(followerId, followee.userId);
    await Promise.all([
      this.people.incrementCounter(followee.userId, 'followerCount', -1),
      this.people.incrementCounter(followerId, 'followingCount', -1),
    ]);
  }

  /** Who the viewer follows, for the feed's FR-033 intersection. */
  async followedAuthorIds(followerId: string): Promise<Set<string>> {
    const page = await this.follows.listFollowing(followerId, { limit: 1000 });
    return new Set(page.items.map((f) => f.followeeId));
  }

  private async requirePerson(handle: string) {
    const person = await this.people.findByHandle(handle);
    if (!person) throw new DomainError(HttpStatus.NOT_FOUND, 'No such person');
    return person;
  }
}
