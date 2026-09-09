import { Inject, Injectable } from '@nestjs/common';
import { SignalRepository } from '../../persistence/signal.repository';
import { InterestFollowRepository } from '../../persistence/interest-follow.repository';
import { CandidateSource, type Candidate } from './candidate-source';
import { MuteRepository } from '../../persistence/mute.repository';
import { DismissalRepository } from '../../persistence/dismissal.repository';
import { rankedInterests } from './decay';
import { DECLARED_INTEREST_WEIGHT, FOLLOWED_AUTHOR_BOOST_MS } from './constants';

export interface RankedResult {
  /** Ordered candidates. NOT a decision about who may see them. */
  candidates: Candidate[];
  fanOutWidth: number;
  /** Whether ranking succeeded, or the fallback ordering was used (FR-009). */
  fallback: boolean;
}

/**
 * SELECTS AND ORDERS CANDIDATES. Decides nothing.
 *
 * Constitution 2.0.0, Principle II: *ranking selects candidates; the visibility
 * boundary decides*. This class has no viewer identity beyond a user id used to
 * read that person's own profile, never asks whether a post may be shown, and
 * cannot reach the visibility boundary - `ranking-cannot-admit.spec.ts` fails
 * the build if it ever imports one.
 *
 * The reason that guard exists is worth keeping next to the code: the COMPOSED
 * feed satisfied Principle II by accident, because it only ever read interests
 * the viewer followed and so could not over-admit. Reading across the whole
 * catalogue removes that accident.
 */
@Injectable()
export class RankingService {
  /** How many weighted interests to draw candidates from. */
  private static readonly EXPLOIT_WIDTH = 12;

  constructor(
    @Inject(SignalRepository) private readonly signals: SignalRepository,
    @Inject(CandidateSource) private readonly source: CandidateSource,
    @Inject(MuteRepository) private readonly mutes: MuteRepository,
    @Inject(DismissalRepository) private readonly dismissals: DismissalRepository,
    @Inject(InterestFollowRepository) private readonly interestFollows: InterestFollowRepository,
  ) {}

  async rank(
    userId: string,
    limit: number,
    followedAuthorIds: ReadonlySet<string>,
    now = Date.now(),
    /**
     * FR-008. How many pages the reader is into this session.
     *
     * The ranker reads DEEPER rather than differently: page two is the same
     * selection over a longer slice of each partition. Re-ranking from a
     * different candidate set every page would reshuffle what the reader has
     * already passed, which is the "visible interruption" FR-008 forbids.
     */
    depth = 0,
  ): Promise<RankedResult> {
    let weights: { interestId: string; weight: number }[] = [];
    let fallback = false;

    try {
      weights = await this.weightsFor(userId, now);
    } catch {
      /**
       * FR-009. A ranking that cannot be produced must not fail the request.
       * The fallback is recency over an unweighted candidate set - defensible,
       * legible, and obviously not personalised, which is better than an error
       * screen and better than a silent empty feed.
       */
      fallback = true;
      weights = [];
    }

    const exploit = weights.slice(0, RankingService.EXPLOIT_WIDTH).map((w) => w.interestId);
    /**
     * 008/FR-039, FR-041. Read ONCE per request, not per candidate.
     *
     * A page considers dozens of authors; a lookup each would be dozens of
     * reads on the hot path. Both sets are small by nature — muting and
     * dismissing are deliberate acts — and both reads are bounded.
     */
    const [mutedAuthorIds, dismissedPostIds] = await Promise.all([
      this.mutes.listMuted(userId),
      this.dismissals.listDismissed(userId),
    ]);
    const { candidates, fanOutWidth } = await this.source.collect(exploit, limit, depth, {
      authorIds: mutedAuthorIds,
      postIds: dismissedPostIds,
    });

    const score = new Map(weights.map((w) => [w.interestId, w.weight]));
    const ordered = [...candidates].sort((a, b) => this.score(b, score, followedAuthorIds, now) - this.score(a, score, followedAuthorIds, now));

    return { candidates: ordered, fanOutWidth, fallback };
  }

  /**
   * THE WEIGHTS. Behaviour plus declarations, in one place ON PURPOSE.
   *
   * FR-011 requires the disclosure in Settings to be rendered from THE SAME
   * weights the ranker reads. "The same" is a promise that decays into a lie
   * the moment there are two expressions of it, and the lie is invisible: the
   * screen keeps rendering, the feed keeps ranking, and they quietly describe
   * different products. So the controller calls THIS method rather than
   * recomputing it, and the sameness is structural.
   *
   * BEHAVIOUR PLUS DECLARATIONS, added rather than chosen between (FR-030).
   *
   * A declaration - a cold-start seed pick, or an interest the person went and
   * followed - is worth one unit, the same as a like. It is enough to shape a
   * feed that has no behaviour to go on, and it is overtaken by somebody who
   * then reads something else for a fortnight, because the behavioural half
   * decays and this half does not need to.
   *
   * It adds WEIGHT and never a boundary. The candidate set is still drawn
   * across the catalogue and the exploration share is untouched, so a followed
   * interest changes the ORDER of a feed and never its membership. Treating it
   * as a filter is how the subscription feed 007 removes would come back,
   * inside the ranker, where the old FR-033 test no longer looks.
   */
  async weightsFor(userId: string, now = Date.now()): Promise<{ interestId: string; weight: number }[]> {
    const [profile, declared] = await Promise.all([
      this.signals.profile(userId),
      this.declarations(userId),
    ]);

    const merged = new Map<string, number>();
    for (const w of rankedInterests(profile?.weights ?? {}, now)) {
      merged.set(w.interestId, w.weight);
    }
    for (const interestId of declared) {
      merged.set(interestId, (merged.get(interestId) ?? 0) + DECLARED_INTEREST_WEIGHT);
    }
    return [...merged]
      .map(([interestId, weight]) => ({ interestId, weight }))
      .sort((a, b) => b.weight - a.weight);
  }

  /**
   * FR-014 and FR-030 through ONE path, because they are the same thing said
   * twice: an interest this person named, rather than one they demonstrated.
   *
   * Seeds are read from their own item type rather than from interest follows
   * (research R4) - storing the cold-start picks as follows would be the easy
   * path and would mean every later reader treats a first-run tap as a
   * subscription. They meet here, at the point of use, which is the only place
   * they should.
   */
  private async declarations(userId: string): Promise<string[]> {
    const [seeds, followed] = await Promise.all([
      this.signals.seeds(userId),
      this.interestFollows.listFollowed(userId).then((rows) => rows.map((r) => r.interestId)),
    ]);
    return [...new Set([...seeds, ...followed])];
  }

  /**
   * Recency, lifted by the viewer's affinity for the post's interest, and by a
   * bounded amount for an author they follow.
   *
   * Both effects are expressed as a TIME BONUS rather than a multiplier so they
   * stay legible: a post competes as though it were N hours newer. A multiplier
   * on an epoch millisecond means nothing and cannot be reasoned about.
   */
  private score(
    item: Candidate,
    weights: Map<string, number>,
    followedAuthorIds: ReadonlySet<string>,
    now: number,
  ): number {
    const base = Date.parse(item.createdAt);
    const affinity = weights.get(item.interestId) ?? 0;
    // Saturating, so one very heavy interest cannot bury everything else.
    const affinityBonus = (1 - Math.exp(-affinity)) * 48 * 60 * 60 * 1000;
    const followBonus = followedAuthorIds.has(item.authorId) ? FOLLOWED_AUTHOR_BOOST_MS : 0;
    return base + affinityBonus + followBonus;
  }
}
