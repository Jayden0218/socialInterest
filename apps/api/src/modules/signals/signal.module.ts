import { Module } from '@nestjs/common';
import { SignalController } from './signal.controller';
import { SignalService } from './signal.service';
import { SeedService } from './seed.service';
import { PostsModule } from '../posts/posts.module';

/**
 * RECORDING WHAT HAPPENED. Not deciding what to show.
 *
 * PostsModule is imported because a signal for a post the caller cannot see must
 * be REJECTED (contracts/signals.md) - which is a visibility question, and the
 * one place in this feature where recording legitimately consults it. Ranking
 * never does.
 */
@Module({
  imports: [PostsModule],
  controllers: [SignalController],
  providers: [SignalService, SeedService],
  exports: [SignalService, SeedService],
})
export class SignalModule {}
