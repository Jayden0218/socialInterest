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
/**
 * 008/FR-008, research R3 — HOW MANY PEOPLE ONE PERSON MAY FOLLOW.
 *
 * A PRODUCT CONSTRAINT ARRIVING FROM A TECHNICAL BOUND, which is the kind of
 * decision the constitution requires be written down rather than absorbed.
 *
 * The Following feed fans out one query per followed author and merge-sorts the
 * results (A45). Without a cap that surface has no stated worst case, and
 * "unbounded but probably fine" is exactly the claim this project's records
 * exist to stop.
 *
 * 200 mirrors `MAX_FOLLOWED_INTERESTS` and the same 2s p95 budget that number
 * was chosen against. Raising it without re-measuring the Following feed puts
 * that budget at risk in the same way.
 *
 * Named in `specs/008-post-reach-and-depth/spec.md`'s Assumptions, because a
 * limit a reader cannot find in the spec is a limit they meet as a bug.
 */
export const MAX_FOLLOWED_PEOPLE = 200;

@Injectable()
export class PersonFollowService {
  constructor(
    @Inject(PersonFollowRepository) private readonly follows: PersonFollowRepository,
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(BlockRepository) private readonly blocks: BlockRepository,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  async follow(
    followerId: string,
    followeeHandle: string,
  ): Promise<{ alreadyFollowing: boolean; pending: boolean }> {
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

    const existing = await this.follows.find(followerId, followee.userId);
    if (existing) {
      // A pending request re-sent is the same request, not a second one. Both
      // answer "you are already in this state", which is what idempotence means
      // here — 005 recorded the cost of a toggle that is not idempotent.
      return { alreadyFollowing: true, pending: (existing.state ?? 'accepted') === 'pending' };
    }

    /**
     * 008/FR-008. Checked AFTER the idempotence check above, so somebody at the
     * cap can still re-follow a person they already follow without being told
     * they are full. Overfetched by one so "at the cap" and "over it" are the
     * same answer.
     */
    const current = await this.follows.listFollowing(followerId, { limit: MAX_FOLLOWED_PEOPLE + 1 });
    if (current.items.length >= MAX_FOLLOWED_PEOPLE) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'Following limit reached',
        `You can follow at most ${MAX_FOLLOWED_PEOPLE} people. Unfollow someone to make room.`,
      );
    }

    /**
     * 008/FR-043 — A PRIVATE ACCOUNT HOLDS THE FOLLOW FOR APPROVAL.
     *
     * The row is written either way, in the state that says which. Nothing is
     * counted yet: a pending request is not a follower, so incrementing here
     * would put a number on the profile that the boundary does not honour, and
     * a count disagreeing with the rows it counts is the defect 008/R2 exists
     * to avoid.
     */
    const pending = (followee.accountPrivacy ?? 'open') === 'private';
    await this.follows.follow(followerId, followee.userId, pending ? 'pending' : 'accepted');
    /**
     * NO NOTIFICATION IS PUBLISHED FOR A REQUEST, and that is a decision.
     *
     * A notification kind is only real when four things exist — the enum, a
     * description, a preference and a publisher — and this project has shipped
     * three halves without their fourth (004's `message` toggle, 007's `follow`
     * kind, 008's `readAt`). Adding a fifth kind here for a story that does not
     * ask for one is how the next one happens.
     *
     * A request is found instead where it is answered: `GET /v1/me` carries
     * `pendingFollowRequests`, so the profile can badge the list rather than
     * the list waiting to be stumbled upon.
     */
    if (pending) return { alreadyFollowing: false, pending: true };

    await this.people.incrementCounter(followee.userId, 'followerCount', 1);
    await this.people.incrementCounter(followerId, 'followingCount', 1);

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
    return { alreadyFollowing: false, pending: false };
  }

  async unfollow(followerId: string, followeeHandle: string): Promise<void> {
    const followee = await this.requirePerson(followeeHandle);
    const existing = await this.follows.find(followerId, followee.userId);
    if (!existing) return;
    await this.follows.unfollow(followerId, followee.userId);
    /**
     * 008/FR-043. WITHDRAWING A REQUEST MOVES NO COUNTER, because sending it
     * moved none. Decrementing on a row that never incremented is how a
     * follower count goes negative, and the previous version of this method
     * would have done exactly that had it not returned early on a pending row.
     */
    if ((existing.state ?? 'accepted') === 'pending') return;
    await Promise.all([
      this.people.incrementCounter(followee.userId, 'followerCount', -1),
      this.people.incrementCounter(followerId, 'followingCount', -1),
    ]);
  }

  /**
   * FR-043. `none` | `pending` | `following`, for a control that has to draw
   * three states and was given a boolean.
   */
  async followState(
    viewerId: string,
    authorId: string,
  ): Promise<'none' | 'pending' | 'following'> {
    const row = await this.follows.find(viewerId, authorId);
    if (!row) return 'none';
    return (row.state ?? 'accepted') === 'pending' ? 'pending' : 'following';
  }

  /** A52 / FR-043. Requests waiting on this person, newest first. */
  async pendingRequests(
    followeeId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ) {
    const page = await this.follows.listPendingRequests(followeeId, opts);
    const people = await Promise.all(page.items.map((f) => this.people.findById(f.followerId)));
    return {
      items: page.items.map((f, i) => ({ follow: f, person: people[i] })),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * FR-043. APPROVE, and only then does anything count.
   *
   * The counters move here rather than at request time, so the profile's
   * follower count and what the boundary grants are the same fact throughout.
   */
  async approveRequest(followeeId: string, followerHandle: string): Promise<void> {
    const follower = await this.requirePerson(followerHandle);
    const row = await this.follows.find(follower.userId, followeeId);
    if (!row || (row.state ?? 'accepted') !== 'pending') {
      throw new DomainError(HttpStatus.NOT_FOUND, 'No such follow request');
    }
    await this.follows.setState(follower.userId, followeeId, 'accepted');
    await Promise.all([
      this.people.incrementCounter(followeeId, 'followerCount', 1),
      this.people.incrementCounter(follower.userId, 'followingCount', 1),
    ]);
    // The follow only becomes real now, so this is where the follow
    // notification belongs — announcing it at request time would tell the
    // author somebody followed them while they were still deciding.
    await this.events.publish({
      type: 'person.followed',
      payload: { followerId: follower.userId, followeeId },
    });
  }

  /**
   * FR-043. DECLINE DELETES THE ROW rather than storing a refusal.
   *
   * A stored `declined` would be a third state nothing reads, and it would stop
   * the person asking again after a change of mind. 004/FR-006's rule in a new
   * place: do not persist a state whose only job is to describe the past.
   */
  async declineRequest(followeeId: string, followerHandle: string): Promise<void> {
    const follower = await this.requirePerson(followerHandle);
    const row = await this.follows.find(follower.userId, followeeId);
    if (!row || (row.state ?? 'accepted') !== 'pending') {
      throw new DomainError(HttpStatus.NOT_FOUND, 'No such follow request');
    }
    await this.follows.unfollow(follower.userId, followeeId);
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
