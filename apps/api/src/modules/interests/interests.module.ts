import { Global, Module } from '@nestjs/common';
import { CATALOGUE_SEARCH, InMemoryCatalogueCache } from './catalogue.cache';
import { InterestService } from './interest.service';
import { InterestSearch } from './catalogue.search';
import { NamePolicy } from './name-policy';

/**
 * Global because the interest catalogue is consulted by nearly every module -
 * feeds expand followed interests (FR-028) and search reads it directly
 * (FR-026).
 *
 * 013/T013. `InterestService` MOVED HERE from the HTTP module, and the reason
 * is structural rather than tidiness: publishing now resolves-or-creates an
 * interest inside the post's transaction, so `PostService` needs it — and
 * `InterestsHttpModule` imports `PostsModule`, so injecting it from there would
 * be a cycle. The service depends on the repository, the cache, the name policy
 * and the search; none of those knows anything about posts, so it belongs at
 * this level and the HTTP module simply re-exports it for its controllers.
 */
@Global()
@Module({
  providers: [
    InMemoryCatalogueCache,
    { provide: CATALOGUE_SEARCH, useExisting: InMemoryCatalogueCache },
    InterestSearch,
    NamePolicy,
    InterestService,
  ],
  exports: [CATALOGUE_SEARCH, InMemoryCatalogueCache, InterestSearch, NamePolicy, InterestService],
})
export class InterestsModule {}
