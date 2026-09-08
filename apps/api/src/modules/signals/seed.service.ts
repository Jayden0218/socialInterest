import { Inject, Injectable } from '@nestjs/common';
import { SignalRepository } from '../../persistence/signal.repository';

/** FR-014: at most this many, and the cap is the product's, not the store's. */
export const MAX_SEED_INTERESTS = 20;

/**
 * THE COLD-START PICKS — a seed, and deliberately NOT a subscription.
 *
 * A ranked feed has nothing to learn from on day one, so the first session asks
 * once. Those picks initialise the ranking and are then overtaken by behaviour.
 *
 * They are stored under their OWN key rather than as interest follows (research
 * R4). That is the whole point: storing them as follows would be the easy path
 * and would quietly recreate the subscription feed 007 removes, because every
 * later reader treats a follow as a follow. A distinct item type makes the
 * difference structural instead of a convention someone has to remember.
 */
@Injectable()
export class SeedService {
  constructor(@Inject(SignalRepository) private readonly signals: SignalRepository) {}

  async choose(userId: string, interestIds: string[]): Promise<void> {
    await this.signals.setSeeds(userId, [...new Set(interestIds)].slice(0, MAX_SEED_INTERESTS));
  }

  async chosen(userId: string): Promise<string[]> {
    return this.signals.seeds(userId);
  }
}
