import { Global, Module } from '@nestjs/common';
import { ProfileProjection } from './profile.projection';

/**
 * Global by design, for the same reason `VisibilityModule` is (008/US5).
 *
 * Nine call sites across seven modules return a `PublicProfile`, and every one
 * of them must build it the same way — `avatarUrl` was emitted on exactly one of
 * them before this, as a raw storage key. Making this importable-per-module
 * would invite a module to provide its own, which is the failure SC-008 and
 * `one-profile-projection.spec.ts` exist to prevent.
 */
@Global()
@Module({
  providers: [ProfileProjection],
  exports: [ProfileProjection],
})
export class ProfileModule {}
