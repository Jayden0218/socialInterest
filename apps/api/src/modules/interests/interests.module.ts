import { Global, Module } from '@nestjs/common';
import { CATALOGUE_SEARCH, InMemoryCatalogueCache } from './catalogue.cache';

/**
 * Global because the interest catalogue is consulted by nearly every module -
 * posts expand sub-interest to parent (FR-024), feeds expand followed interests
 * (FR-028), and search reads it directly (FR-026).
 */
@Global()
@Module({
  providers: [InMemoryCatalogueCache, { provide: CATALOGUE_SEARCH, useExisting: InMemoryCatalogueCache }],
  exports: [CATALOGUE_SEARCH, InMemoryCatalogueCache],
})
export class InterestsModule {}
