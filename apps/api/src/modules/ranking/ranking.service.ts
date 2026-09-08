import { Inject, Injectable } from '@nestjs/common';
import { SignalRepository } from '../../persistence/signal.repository';
import { CandidateSource, type Candidate } from './candidate-source';
import { rankedInterests } from './decay';
import { FOLLOWED_AUTHOR_BOOST_MS } from './constants';

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
      const profile = await this.signals.profile(userId);
      weights = rankedInterests(profile?.weights ?? {}, now);
      if (weights.length === 0) {
        // No behaviour yet: the cold-start picks stand in until there is some
        // (FR-014, FR-015). They are a seed, not a subscription.
        const seeds = await this.signals.seeds(userId);
        weights = seeds.map((interestId) => ({ interestId, weight: 1 }));
      }
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
    const { candidates, fanOutWidth } = await this.source.collect(exploit, limit, depth);

    const score = new Map(weights.map((w) => [w.interestId, w.weight]));
    const ordered = [...candidates].sort((a, b) => this.score(b, score, followedAuthorIds, now) - this.score(a, score, followedAuthorIds, now));

    return { candidates: ordered, fanOutWidth, fallback };
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
