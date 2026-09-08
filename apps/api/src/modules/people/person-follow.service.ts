import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/problem.filter';
import { BlockRepository } from '../../persistence/block.repository';
import { PersonFollowRepository } from '../../persistence/person-follow.repository';
import { PersonRepository } from '../../persistence/person.repository';
import { EVENT_BUS, type EventBus } from '../../ports';

/**
 * FR-037 person following.
 *
 * Following someone does NOT widen their feed. This service only records the
 * relationship; what it grants is decided at read time in two places: the
 * visibility filter (followers-only posts) and, since 007, `RankingService` -
 * where 007/FR-029 gives a follow a BOUNDED BOOST that reorders and never
 * admits.
 *
 * The old wording here named 001/FR-033's "intersection rule (prominence within
 * followed interests only)", which 007 withdrew: a ranked feed has no
 * followed-interest set to be confined to.
 */
@Injectable()
export class PersonFollowService {
  constructor(
    @Inject(PersonFollowRepository) private readonly follows: PersonFollowRepository,
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(BlockRepository) private readonly blocks: BlockRepository,
    @Inject(EVENT_BUS) private readonly events: EventBus,
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

    /**
     * 007/T053 — AND THIS EVENT DID NOT EXIST.
     *
     * `follow` is a declared notification kind: the schema has it,
     * `describeNotification` renders "X followed you", and Edit profile offers
     * "New followers" as a toggle somebody can switch on. Nothing ever created
     * one. A person could turn on a notification that could not fire, and the
     * only way to find out was to look for the notification and not find it —
     * which is what `response-shape.spec.ts` now does.
     *
     * Same family as 004/FR-031's message toggle, inverted: there the
     * notification existed and the control did not; here the control existed
     * and the notification did not. Both are a requirement reported complete
     * because only one half of it was looked at.
     *
     * Published rather than written here, so the preference check stays in
     * `NotificationService` — a second place that decides whether to notify is
     * a second place to get FR-049 wrong.
     */
    await this.events.publish({
      type: 'person.followed',
      payload: { followerId, followeeId: followee.userId },
    });
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
