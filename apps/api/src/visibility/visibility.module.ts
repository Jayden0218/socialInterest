import { Global, Module } from '@nestjs/common';
import { AuthoredContentVisibility } from './authored-content';
import { VisibilityFilter } from './visibility.filter';

/**
 * Global by design (constitution principle II): every module that reads posts
 * must reach the same filter. Making it importable-per-module would invite a
 * module to provide its own, which is precisely the failure SC-009 guards.
 */
@Global()
@Module({
  providers: [VisibilityFilter, AuthoredContentVisibility],
  exports: [VisibilityFilter, AuthoredContentVisibility],
})
export class VisibilityModule {}
