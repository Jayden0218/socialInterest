import { Module } from '@nestjs/common';
import { SignalController } from './signal.controller';
import { SignalService } from './signal.service';
import { SeedService } from './seed.service';
import { PostsModule } from '../posts/posts.module';
import { RankingModule } from '../ranking/ranking.module';

/**
 * RECORDING WHAT HAPPENED. Not deciding what to show.
 *
 * RankingModule is imported for the DISCLOSURE only (FR-011), which must render
 * from the same weights the ranker reads. That direction - signals depending on
 * ranking - is the safe one; ranking never depends on this module, and never on
 * the visibility boundary.
 *
 * PostsModule is imported because a signal for a post the caller cannot see must
 * be REJECTED (contracts/signals.md) - which is a visibility question, and the
 * one place in this feature where recording legitimately consults it. Ranking
 * never does.
 */
@Module({
  imports: [PostsModule, RankingModule],
  controllers: [SignalController],
  providers: [SignalService, SeedService],
  exports: [SignalService, SeedService],
})
export class SignalModule {}
