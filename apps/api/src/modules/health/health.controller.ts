import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from '../../common/auth/auth.guard';
import { CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import { CATALOGUE_SEARCH, type CatalogueSearch } from '../interests/catalogue.cache';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch,
  ) {}

  /**
   * quickstart.md checks `catalogueSize > 0` here: with an empty catalogue,
   * FR-022 means no sub-interest can be created and so nothing can be published.
   */
  @Public()
  @Get()
  health(): { status: string; profile: string; catalogueSize: number } {
    return {
      status: 'ok',
      profile: this.config.profile,
      catalogueSize: this.catalogue.size(),
    };
  }
}
