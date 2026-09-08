import { Module } from '@nestjs/common';
import { RankingService } from './ranking.service';
import { CandidateSource } from './candidate-source';

/**
 * CANDIDATE SELECTION AND ORDERING. Nothing else.
 *
 * This module deliberately does NOT import the visibility boundary, and
 * `apps/api/tests/unit/ranking-cannot-admit.spec.ts` fails the build if it ever
 * does. Constitution 2.0.0 Principle II: ranking selects candidates, the
 * visibility boundary decides - see contracts/ranking-boundary.md.
 *
 * It is a separate module from `signals/` on purpose. Recording what happened
 * and deciding what to show are different jobs, and keeping them apart is what
 * lets the guard state "ranking cannot reach the boundary" as a fact about the
 * import graph rather than a claim about intent.
 */
@Module({
  providers: [RankingService, CandidateSource],
  exports: [RankingService],
})
export class RankingModule {}
