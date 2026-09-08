import { Body, Controller, Delete, Get, Inject, Post, Req } from '@nestjs/common';
import type { AppRequest } from '../../common/http/request';
import { SignalService, type IncomingSignal } from './signal.service';
import { SeedService } from './seed.service';
import { SignalRepository } from '../../persistence/signal.repository';
import { RankingService } from '../ranking/ranking.service';
import { CATALOGUE_SEARCH, type CatalogueSearch } from '../interests/catalogue.cache';

/**
 * The caller, from the TOKEN. Never from the body — a signal names a post, and
 * whose behaviour it is must not be something a client can state.
 *
 * `req.viewer` is what the auth guard sets. The first version of this file read
 * `req.user`, which is Passport's convention and not this application's: it is
 * always undefined here, so every one of these routes answered 500.
 */
function callerId(req: AppRequest): string {
  return req.viewer!.userId;
}

/**
 * No prefix here. `app.setGlobalPrefix('v1')` supplies it - a controller-level
 * 'v1' would have produced `/v1/v1/...`, which 404s while every route the smoke
 * test checks keeps passing, because it checks other controllers.
 */
@Controller()
export class SignalController {
  constructor(
    @Inject(SignalService) private readonly signals: SignalService,
    @Inject(SeedService) private readonly seeds: SeedService,
    @Inject(SignalRepository) private readonly repo: SignalRepository,
    @Inject(RankingService) private readonly ranking: RankingService,
    @Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch,
  ) {}

  /**
   * FR-003. Written for the AUTHENTICATED CALLER ONLY.
   *
   * The subject is taken from the token and never from the body, so a client
   * cannot record a signal against somebody else. contracts/signals.md lists
   * this as a hostile-client case because it is the obvious one to try.
   */
  @Post('signals')
  async record(@Req() req: AppRequest, @Body() body: { signals?: IncomingSignal[] }) {
    return this.signals.record({ userId: callerId(req) }, body.signals ?? []);
  }

  /**
   * FR-011. What the feed is built from, in the person's own terms.
   *
   * Rendered from THE SAME weights the ranker reads, through the same decay
   * function - so the explanation cannot drift from the behaviour it describes.
   * That is not a nicety: an explanation computed separately is an explanation
   * that becomes false without anyone noticing.
   */
  @Get('me/feed-signals')
  async explain(@Req() req: AppRequest) {
    const userId = callerId(req);
    /**
     * Through the RANKER's own method, not a second computation of it. An
     * explanation computed separately is an explanation that becomes false
     * without anyone noticing - and it would have done so within one commit
     * here: FR-030 added standing declarations to the ranking, and a disclosure
     * reading only the behavioural profile would have omitted every interest
     * the person had explicitly chosen.
     */
    const ranked = await this.ranking.weightsFor(userId);
    return {
      interests: ranked.slice(0, 8).map((r) => ({
        interestId: r.interestId,
        name: this.catalogue.byId(r.interestId)?.name ?? r.interestId,
        weight: Number(r.weight.toFixed(3)),
      })),
      seedInterests: await this.seeds.chosen(userId),
      collected: ['posts you open', 'how long you stay', 'what you like', 'what you save'],
    };
  }

  /**
   * FR-012. Deletes the profile AND the raw events.
   *
   * Both, or the promise is false in a way nobody would notice. Afterwards the
   * feed ranks as it would for a new account holding the same seeds - which is
   * what `signal-reset.spec.ts` asserts against the STORE, not against the fact
   * that this endpoint returned 204.
   */
  @Delete('me/feed-signals')
  async clear(@Req() req: AppRequest) {
    const userId = callerId(req);
    await this.repo.clear(userId);
    this.signals.forget(userId);
    return { cleared: true };
  }

  /** FR-014. The one-time cold-start selection. */
  @Post('me/seed-interests')
  async seed(@Req() req: AppRequest, @Body() body: { interestIds?: string[] }) {
    await this.seeds.choose(callerId(req), body.interestIds ?? []);
    return { seedInterests: await this.seeds.chosen(callerId(req)) };
  }
}
